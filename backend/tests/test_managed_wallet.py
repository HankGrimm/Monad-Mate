"""
Tests for the managed (AA-style) wallet onboarding path — PRD 场景6.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.models.user import User, VerificationLevel, WalletKind
from app.services import managed_wallet_service as mws
from app.services.managed_wallet_service import ManagedWalletService


def test_login_code_returned_only_in_development(db, monkeypatch):
    svc = ManagedWalletService(db)

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    dev = svc.request_code(email="a@example.com")
    assert dev["code"] is not None
    assert dev["delivery"] == "returned_in_response"

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    prod = svc.request_code(email="b@example.com")
    # A deployed API must never hand the login code back over HTTP.
    assert prod["code"] is None
    assert prod["delivery"] == "out_of_band"


def test_verify_creates_managed_user_without_key_material(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    svc = ManagedWalletService(db)

    issued = svc.request_code(email="new@example.com")
    token = svc.verify_code(issued["code"], email="new@example.com")

    assert token.access_token
    assert token.user.wallet_kind == WalletKind.MANAGED
    assert token.user.wallet_address.startswith("0x")

    # The response model must not leak anything key-shaped.
    dumped = token.model_dump()
    assert "private_key" not in str(dumped)


def test_same_email_resolves_to_same_address(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    svc = ManagedWalletService(db)

    first = svc.request_code(email="stable@example.com")
    user_a = svc.verify_code(first["code"], email="stable@example.com").user
    second = svc.request_code(email="stable@example.com")
    user_b = svc.verify_code(second["code"], email="stable@example.com").user

    assert user_a.id == user_b.id
    assert user_a.wallet_address == user_b.wallet_address
    assert db.query(User).count() == 1


def test_different_subjects_get_different_addresses(db):
    assert mws.derive_address("email:a@example.com") != mws.derive_address(
        "email:b@example.com"
    )


def test_phone_login_reaches_phone_verification_tier(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    svc = ManagedWalletService(db)

    issued = svc.request_code(phone="+8613800000000")
    user = svc.verify_code(issued["code"], phone="+8613800000000").user

    assert user.verification_level == VerificationLevel.PHONE


def test_code_is_single_use(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    svc = ManagedWalletService(db)

    issued = svc.request_code(email="once@example.com")
    svc.verify_code(issued["code"], email="once@example.com")

    with pytest.raises(HTTPException) as exc:
        svc.verify_code(issued["code"], email="once@example.com")
    assert exc.value.status_code == 401


def test_wrong_code_rejected(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    svc = ManagedWalletService(db)
    svc.request_code(email="wrong@example.com")

    with pytest.raises(HTTPException) as exc:
        svc.verify_code("000000", email="wrong@example.com")
    assert exc.value.status_code == 401


def test_email_and_phone_together_rejected(db):
    svc = ManagedWalletService(db)
    with pytest.raises(HTTPException) as exc:
        svc.request_code(email="a@example.com", phone="+8613800000000")
    assert exc.value.status_code == 400


def test_neither_email_nor_phone_rejected(db):
    svc = ManagedWalletService(db)
    with pytest.raises(HTTPException) as exc:
        svc.request_code()
    assert exc.value.status_code == 400


def test_account_info_discloses_custody(db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    svc = ManagedWalletService(db)
    issued = svc.request_code(email="custody@example.com")
    svc.verify_code(issued["code"], email="custody@example.com")

    user = db.query(User).first()
    info = svc.account_info(user)

    assert info["managed"] is True
    assert info["gas_sponsored"] is True
    # Custodial risk must be stated, not implied.
    assert "custodial" in info["custody_disclosure"].lower()


def test_external_user_info_reports_self_custody(db):
    user = User(id=uuid.uuid4(), wallet_address="0xabc", wallet_kind=WalletKind.EXTERNAL)
    db.add(user)
    db.flush()

    info = ManagedWalletService(db).account_info(user)
    assert info["managed"] is False
    assert info["gas_sponsored"] is False


def test_link_external_requires_valid_signature(db):
    user = User(
        id=uuid.uuid4(), wallet_address="0xmanaged", wallet_kind=WalletKind.MANAGED
    )
    db.add(user)
    db.flush()

    with pytest.raises(HTTPException) as exc:
        ManagedWalletService(db).link_external_wallet(
            user, "0xdeadbeef", "0xnotasignature", "nonce"
        )
    assert exc.value.status_code == 401


def test_link_external_rejects_already_self_custodial(db):
    user = User(
        id=uuid.uuid4(), wallet_address="0xexternal", wallet_kind=WalletKind.EXTERNAL
    )
    db.add(user)
    db.flush()

    with pytest.raises(HTTPException) as exc:
        ManagedWalletService(db).link_external_wallet(user, "0xother", "sig", "nonce")
    assert exc.value.status_code == 400


def test_managed_signing_produces_signature(db):
    signature = mws.sign_message_for("email:sign@example.com", "hello monad")
    assert signature is not None and len(signature) > 20
