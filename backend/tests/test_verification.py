"""
Tests for R4 — 实名认证接入.

The ID path is a stub; these tests pin down that it stays honest about that, is
disabled outside development, and never persists credential details.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.models.user import User, VerificationLevel
from app.services.verification_service import (
    STUB_ID_DISCLOSURE, VerificationService, _hash_document,
)


def make_user(db, level=VerificationLevel.WALLET) -> User:
    user = User(
        id=uuid.uuid4(),
        wallet_address=f"0x{uuid.uuid4().hex[:38]}",
        verification_level=level,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture(autouse=True)
def _dev_env(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def test_wallet_tier_cannot_create_meetups(db):
    user = make_user(db)
    status = VerificationService(db).status(user)

    assert status["can_create_meetups"] is False
    assert status["next_step"] == "verify_phone"


def test_phone_tier_unlocks_meetups(db):
    user = make_user(db, VerificationLevel.PHONE)
    status = VerificationService(db).status(user)

    assert status["can_create_meetups"] is True
    assert status["next_step"] == "verify_id"


def test_status_admits_id_is_a_stub(db):
    user = make_user(db)
    assert VerificationService(db).status(user)["id_verification_is_stub"] is True


# ---------------------------------------------------------------------------
# Phone
# ---------------------------------------------------------------------------

def test_phone_verification_raises_tier(db):
    user = make_user(db)
    svc = VerificationService(db)

    issued = svc.start_phone(user, "+8613800001111")
    updated = svc.confirm_phone(user, "+8613800001111", issued["code"])

    assert updated.verification_level == VerificationLevel.PHONE
    assert updated.phone == "+8613800001111"


def test_phone_code_withheld_outside_development(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    user = make_user(db)

    issued = VerificationService(db).start_phone(user, "+8613800002222")
    assert issued["code"] is None
    assert issued["delivery"] == "out_of_band"


def test_wrong_phone_code_rejected(db):
    user = make_user(db)
    svc = VerificationService(db)
    svc.start_phone(user, "+8613800003333")

    with pytest.raises(HTTPException) as exc:
        svc.confirm_phone(user, "+8613800003333", "000000")
    assert exc.value.status_code == 401


def test_phone_code_is_single_use(db):
    user = make_user(db)
    svc = VerificationService(db)
    issued = svc.start_phone(user, "+8613800004444")
    svc.confirm_phone(user, "+8613800004444", issued["code"])

    with pytest.raises(HTTPException) as exc:
        svc.confirm_phone(user, "+8613800004444", issued["code"])
    assert exc.value.status_code == 401


def test_invalid_phone_rejected(db):
    user = make_user(db)
    with pytest.raises(HTTPException) as exc:
        VerificationService(db).start_phone(user, "not-a-number")
    assert exc.value.status_code == 400


def test_phone_cannot_be_claimed_twice(db):
    first = make_user(db, VerificationLevel.PHONE)
    first.phone = "+8613800005555"
    db.flush()

    second = make_user(db)
    with pytest.raises(HTTPException) as exc:
        VerificationService(db).start_phone(second, "+8613800005555")
    assert exc.value.status_code == 409


# ---------------------------------------------------------------------------
# ID (stub)
# ---------------------------------------------------------------------------

def test_id_requires_phone_first(db):
    user = make_user(db)
    with pytest.raises(HTTPException) as exc:
        VerificationService(db).submit_id(user, "ID1234567", 1996)
    assert exc.value.status_code == 400


def test_id_submission_raises_tier_and_discloses_stub(db):
    user = make_user(db, VerificationLevel.PHONE)
    result = VerificationService(db).submit_id(user, "ID1234567", 1996)

    assert result["verification_level"] == "id"
    assert result["is_stub"] is True
    assert result["disclosure"] == STUB_ID_DISCLOSURE
    assert "nothing was actually checked" in result["disclosure"]


def test_document_number_is_never_stored(db):
    user = make_user(db, VerificationLevel.PHONE)
    VerificationService(db).submit_id(user, "ID9998887", 1996)
    db.refresh(user)

    # Only a salted hash is kept — PRD R4 forbids storing credential details.
    assert user.id_document_hash == _hash_document("ID9998887")
    assert "ID9998887" not in (user.id_document_hash or "")


def test_age_verified_derived_from_birth_year(db):
    adult = make_user(db, VerificationLevel.PHONE)
    VerificationService(db).submit_id(adult, "ID1111111", 1990)
    db.refresh(adult)
    assert adult.age_verified is True

    minor = make_user(db, VerificationLevel.PHONE)
    VerificationService(db).submit_id(minor, "ID2222222", 2015)
    db.refresh(minor)
    assert minor.age_verified is False


def test_same_document_cannot_verify_two_accounts(db):
    first = make_user(db, VerificationLevel.PHONE)
    VerificationService(db).submit_id(first, "ID7776665", 1990)

    second = make_user(db, VerificationLevel.PHONE)
    with pytest.raises(HTTPException) as exc:
        VerificationService(db).submit_id(second, "ID7776665", 1990)
    assert exc.value.status_code == 409


def test_id_stub_unavailable_in_production(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_STUB_ID_VERIFICATION", False)
    user = make_user(db, VerificationLevel.PHONE)

    with pytest.raises(HTTPException) as exc:
        VerificationService(db).submit_id(user, "ID1234567", 1996)
    # A deployed instance must not hand out ID tiers for free.
    assert exc.value.status_code == 503


def test_operator_can_opt_into_stub(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_STUB_ID_VERIFICATION", True)
    user = make_user(db, VerificationLevel.PHONE)

    result = VerificationService(db).submit_id(user, "ID3334445", 1990)
    assert result["verification_level"] == "id"


# ---------------------------------------------------------------------------
# Tier ordering
# ---------------------------------------------------------------------------

def test_verification_never_downgrades_a_tier(db):
    user = make_user(db, VerificationLevel.FULL)
    svc = VerificationService(db)
    issued = svc.start_phone(user, "+8613800006666")
    svc.confirm_phone(user, "+8613800006666", issued["code"])

    db.refresh(user)
    assert user.verification_level == VerificationLevel.FULL
