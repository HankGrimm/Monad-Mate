"""
Tests for R8 (soulbound 履约凭证) and R9 (信用分门槛与免责声明).
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app.models.attestation import (
    AttestationMethod, AttestationStatus, MeetupAttestation,
)
from app.models.fulfilment_credential import (
    CredentialMintStatus, CredentialOutcome, FulfilmentCredential,
)
from app.models.match import Match, MatchStatus
from app.models.meetup_request import SceneType, VenueType
from app.models.persona import Persona, IntentMode
from app.models.user import User, VerificationLevel
from app.schemas.meetup_request import MeetupRequestCreate
from app.services.fulfilment_credential_service import (
    FulfilmentCredentialService, _CREDIT_MIN_HISTORY,
)
from app.services.meetup_request_service import MeetupRequestService


def make_user(db) -> User:
    user = User(
        id=uuid.uuid4(),
        wallet_address=f"0x{uuid.uuid4().hex[:38]}",
        verification_level=VerificationLevel.ID,
    )
    db.add(user)
    db.flush()
    return user


def make_request(db, user: User, scene: SceneType = SceneType.DINING):
    return MeetupRequestService(db).create(
        user,
        MeetupRequestCreate(
            venue_type=VenueType.MALL,
            venue_name="Taikoo Li Mall",
            venue_key="mall-taikoo-li",
            scene=scene,
            duration_minutes=60,
        ),
    )


def make_attestation(db, a: User, b: User, confirmed: bool = True):
    persona_a = Persona(
        id=uuid.uuid4(), user_id=a.id, display_name="A", intent_mode=IntentMode.SOCIAL
    )
    persona_b = Persona(
        id=uuid.uuid4(), user_id=b.id, display_name="B", intent_mode=IntentMode.SOCIAL
    )
    db.add_all([persona_a, persona_b])
    db.flush()

    match = Match(
        id=uuid.uuid4(),
        requester_persona_id=persona_a.id,
        target_persona_id=persona_b.id,
        status=MatchStatus.ACCEPTED,
    )
    db.add(match)
    db.flush()

    attestation = MeetupAttestation(
        id=uuid.uuid4(),
        match_id=match.id,
        initiator_user_id=a.id,
        counterparty_user_id=b.id,
        method=AttestationMethod.GPS_CHECKIN,
        status=(
            AttestationStatus.CONFIRMED if confirmed else AttestationStatus.INITIATED
        ),
        initiator_confirmed=confirmed,
        counterparty_confirmed=confirmed,
    )
    db.add(attestation)
    db.flush()
    return attestation


# ---------------------------------------------------------------------------
# R8 — issuance
# ---------------------------------------------------------------------------

def test_issue_creates_one_credential_per_party(db):
    a, b = make_user(db), make_user(db)
    make_request(db, a)
    make_request(db, b)
    attestation = make_attestation(db, a, b)

    issued = FulfilmentCredentialService(db).issue_for_attestation(attestation.id)

    assert len(issued) == 2
    assert {c.holder_id for c in issued} == {a.id, b.id}
    assert all(c.soulbound for c in issued)


def test_credential_metadata_excludes_counterparty(db):
    a, b = make_user(db), make_user(db)
    make_request(db, a)
    make_request(db, b)
    attestation = make_attestation(db, a, b)

    credential = FulfilmentCredentialService(db).issue_for_attestation(
        attestation.id
    )[0]

    blob = str(credential.metadata_json)
    assert str(b.id) not in blob
    assert b.wallet_address not in blob
    assert credential.metadata_json["scene"] == "dining"
    assert credential.metadata_json["venue_type"] == "mall"
    assert "safety" in credential.metadata_json["disclaimer"].lower()


def test_unconfirmed_attestation_cannot_issue(db):
    a, b = make_user(db), make_user(db)
    attestation = make_attestation(db, a, b, confirmed=False)

    with pytest.raises(HTTPException) as exc:
        FulfilmentCredentialService(db).issue_for_attestation(attestation.id)
    assert exc.value.status_code == 400


def test_issuing_twice_is_idempotent(db):
    a, b = make_user(db), make_user(db)
    make_request(db, a)
    make_request(db, b)
    attestation = make_attestation(db, a, b)
    svc = FulfilmentCredentialService(db)

    first = svc.issue_for_attestation(attestation.id)
    second = svc.issue_for_attestation(attestation.id)

    assert {c.id for c in first} == {c.id for c in second}
    assert db.query(FulfilmentCredential).count() == 2


def test_mint_stays_pending_without_chain_config(db):
    a, b = make_user(db), make_user(db)
    make_request(db, a)
    make_request(db, b)
    attestation = make_attestation(db, a, b)

    credential = FulfilmentCredentialService(db).issue_for_attestation(
        attestation.id
    )[0]

    # No signer key in the test env — degrade gracefully, don't raise.
    assert credential.mint_status == CredentialMintStatus.PENDING
    assert credential.tx_hash is None


def test_list_for_user_is_scoped_and_counted(db):
    a, b = make_user(db), make_user(db)
    make_request(db, a)
    make_request(db, b)
    attestation = make_attestation(db, a, b)
    svc = FulfilmentCredentialService(db)
    svc.issue_for_attestation(attestation.id)

    items, total = svc.list_for_user(a.id)
    assert total == 1
    assert items[0].holder_id == a.id


# ---------------------------------------------------------------------------
# R9 — credit score
# ---------------------------------------------------------------------------

def test_credit_hidden_below_history_threshold(db):
    user = make_user(db)
    svc = FulfilmentCredentialService(db)
    svc.issue(user.id, CredentialOutcome.KEPT)

    credit = svc.get_credit(user.id)
    assert credit["fulfilled_count"] == 1
    assert credit["score_available"] is False
    assert credit["credit_score"] is None
    assert credit["required_fulfilments"] == _CREDIT_MIN_HISTORY


def test_credit_unlocks_after_threshold(db):
    user = make_user(db)
    svc = FulfilmentCredentialService(db)
    for _ in range(_CREDIT_MIN_HISTORY):
        svc.issue(user.id, CredentialOutcome.KEPT)

    credit = svc.get_credit(user.id)
    assert credit["score_available"] is True
    assert credit["credit_score"] > 50.0
    assert credit["breakdown"]["kept_bonus"] > 0


def test_no_shows_lower_the_score(db):
    kept_user = make_user(db)
    mixed_user = make_user(db)
    svc = FulfilmentCredentialService(db)

    for _ in range(_CREDIT_MIN_HISTORY):
        svc.issue(kept_user.id, CredentialOutcome.KEPT)
        svc.issue(mixed_user.id, CredentialOutcome.KEPT)
    svc.issue(mixed_user.id, CredentialOutcome.NO_SHOW)

    assert (
        svc.get_credit(mixed_user.id)["credit_score"]
        < svc.get_credit(kept_user.id)["credit_score"]
    )


def test_credit_always_carries_safety_disclaimer(db):
    user = make_user(db)
    credit = FulfilmentCredentialService(db).get_credit(user.id)
    # PRD: 信用不等于人身安全担保 — the caveat must always be present.
    assert "not a personal-safety guarantee" in credit["disclaimer"]


def test_profile_records_scene_and_time_habits(db):
    user = make_user(db)
    make_request(db, user, scene=SceneType.DINING)
    svc = FulfilmentCredentialService(db)
    svc.issue(user.id, CredentialOutcome.KEPT)

    profile = svc._recompute_profile(user.id)
    assert profile.scene_preference.get("dining") == 1
    assert sum(profile.time_slot_preference.values()) == 1


def test_no_show_credentials_do_not_count_as_habits(db):
    user = make_user(db)
    make_request(db, user, scene=SceneType.DINING)
    svc = FulfilmentCredentialService(db)
    svc.issue(user.id, CredentialOutcome.NO_SHOW)

    profile = svc._recompute_profile(user.id)
    assert profile.scene_preference == {}
    assert profile.no_show_count == 1
