"""
Tests for R6/R7 — deposit lifecycle and arbitration.

Covers the parts of the PRD that the previous implementation contradicted:
deposits must be linked to a meetup, released automatically on mutual check-in,
and never auto-penalised from a one-sided signal.
"""
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.models.attestation import (
    AttestationMethod, AttestationStatus, MeetupAttestation,
)
from app.models.match import Match, MatchStatus
from app.models.meetup_request import SceneType, VenueType
from app.models.persona import IntentMode, Persona
from app.models.stake import Stake, StakeStatus, StakeType
from app.models.user import User, VerificationLevel
from app.schemas.attestation import AttestationConfirm, AttestationInitiate
from app.schemas.meetup_request import MeetupRequestCreate
from app.schemas.stake import StakeCreate
from app.services.meetup_attestation_service import MeetupAttestationService
from app.services.meetup_request_service import MeetupRequestService
from app.services.stake_service import StakeService


def make_user(db) -> User:
    user = User(
        id=uuid.uuid4(),
        wallet_address=f"0x{uuid.uuid4().hex[:38]}",
        verification_level=VerificationLevel.ID,
    )
    db.add(user)
    db.flush()
    return user


def confirmed_meetup(db):
    """Two verified users with a confirmed pairing."""
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    body = MeetupRequestCreate(
        venue_type=VenueType.MALL,
        venue_name="Taikoo Li Mall",
        venue_key="mall-taikoo-li",
        scene=SceneType.DINING,
        duration_minutes=60,
    )
    ra = svc.create(a, body)
    rb = svc.create(b, body)
    match = svc.propose(a, ra.id, rb.id)
    svc.respond(b, match.id, accept=True)
    db.refresh(match)
    return a, b, match


def legacy_match(db, a: User, b: User) -> Match:
    """The room-based Match row an attestation still requires."""
    pa = Persona(id=uuid.uuid4(), user_id=a.id, display_name="A",
                 intent_mode=IntentMode.SOCIAL)
    pb = Persona(id=uuid.uuid4(), user_id=b.id, display_name="B",
                 intent_mode=IntentMode.SOCIAL)
    db.add_all([pa, pb])
    db.flush()
    match = Match(id=uuid.uuid4(), requester_persona_id=pa.id,
                  target_persona_id=pb.id, status=MatchStatus.ACCEPTED)
    db.add(match)
    db.flush()
    return match


def deposit(db, user: User, meetup_match_id) -> Stake:
    return StakeService(db).create(
        user,
        StakeCreate(
            stake_type=StakeType.CONFIRM_MEETUP,
            amount_mon=5.0,
            meetup_match_id=meetup_match_id,
        ),
    )


# ---------------------------------------------------------------------------
# R6 — deposit must reference the meetup
# ---------------------------------------------------------------------------

def test_meetup_deposit_requires_match_id(db):
    user = make_user(db)
    with pytest.raises(HTTPException) as exc:
        StakeService(db).create(
            user,
            StakeCreate(stake_type=StakeType.CONFIRM_MEETUP, amount_mon=5.0),
        )
    assert exc.value.status_code == 400
    assert "meetup_match_id" in exc.value.detail


def test_deposit_records_the_match(db):
    a, _, match = confirmed_meetup(db)
    stake = deposit(db, a, match.id)

    assert stake.meetup_match_id == match.id
    assert stake.status == StakeStatus.ACTIVE


def test_other_stake_types_need_no_match(db):
    user = make_user(db)
    stake = StakeService(db).create(
        user, StakeCreate(stake_type=StakeType.JOIN_ROOM, amount_mon=1.0)
    )
    assert stake.meetup_match_id is None


# ---------------------------------------------------------------------------
# R6 — automatic refund on mutual check-in
# ---------------------------------------------------------------------------

def test_both_deposits_refund_when_attestation_confirms(db):
    a, b, match = confirmed_meetup(db)
    stake_a = deposit(db, a, match.id)
    stake_b = deposit(db, b, match.id)
    inner = legacy_match(db, a, b)

    att_svc = MeetupAttestationService(db)
    att = att_svc.initiate(
        a,
        AttestationInitiate(
            match_id=inner.id,
            method=AttestationMethod.MUTUAL_CONFIRMATION,
            meetup_match_id=match.id,
        ),
    )
    # Both sides check in — initiating is not the same as confirming.
    att_svc.confirm(a, att.id, AttestationConfirm())
    att_svc.confirm(b, att.id, AttestationConfirm())

    db.refresh(att)
    db.refresh(stake_a)
    db.refresh(stake_b)
    assert att.status == AttestationStatus.CONFIRMED
    # Neither user had to ask — both deposits came back together.
    assert stake_a.status == StakeStatus.REFUNDED
    assert stake_b.status == StakeStatus.REFUNDED


def test_refund_for_match_ignores_unrelated_deposits(db):
    a, b, match = confirmed_meetup(db)
    mine = deposit(db, a, match.id)
    unrelated = StakeService(db).create(
        a, StakeCreate(stake_type=StakeType.JOIN_ROOM, amount_mon=1.0)
    )

    StakeService(db).refund_for_match(match.id)

    db.refresh(mine)
    db.refresh(unrelated)
    assert mine.status == StakeStatus.REFUNDED
    assert unrelated.status == StakeStatus.ACTIVE


# ---------------------------------------------------------------------------
# R7 — arbitration instead of penalty
# ---------------------------------------------------------------------------

def test_one_sided_timeout_freezes_rather_than_penalises(db):
    a, b, match = confirmed_meetup(db)
    stake_a = deposit(db, a, match.id)
    stake_b = deposit(db, b, match.id)
    inner = legacy_match(db, a, b)

    att_svc = MeetupAttestationService(db)
    att = att_svc.initiate(
        a,
        AttestationInitiate(
            match_id=inner.id,
            method=AttestationMethod.MUTUAL_CONFIRMATION,
            meetup_match_id=match.id,
        ),
    )
    att.initiator_confirmed = True
    db.commit()

    att_svc.mark_pending_arbitration(att, "Only one party checked in.")

    db.refresh(att)
    db.refresh(stake_a)
    db.refresh(stake_b)
    assert att.status == AttestationStatus.PENDING_ARBITRATION
    # Frozen for review — explicitly not slashed, and no reason recorded that
    # would imply fault.
    assert stake_a.status == StakeStatus.DISPUTED
    assert stake_b.status == StakeStatus.DISPUTED
    assert stake_a.slash_reason is None
    assert stake_b.slash_reason is None


def test_arbitration_status_exists_and_is_distinct():
    """R7 requires a state that is neither confirmed nor a violation."""
    assert AttestationStatus.PENDING_ARBITRATION.value == "pending_arbitration"
    assert AttestationStatus.PENDING_ARBITRATION not in (
        AttestationStatus.CONFIRMED,
        AttestationStatus.FAILED,
        AttestationStatus.EXPIRED,
    )


# ---------------------------------------------------------------------------
# On-chain deposit verification
# ---------------------------------------------------------------------------

def test_deposit_accepted_without_chain_when_unconfigured(db):
    """No deposit address configured → demo mode, no tx required."""
    a, _, match = confirmed_meetup(db)
    stake = deposit(db, a, match.id)

    assert stake.status == StakeStatus.ACTIVE
    # Nothing was verified, and the flag says so rather than implying otherwise.
    assert stake.onchain_verified is False


def test_tx_hash_required_when_deposit_address_configured(db):
    a, _, match = confirmed_meetup(db)

    with patch(
        "app.services.stake_service.deposit_address",
        return_value="0x000000000000000000000000000000000000dEaD",
    ):
        with pytest.raises(HTTPException) as exc:
            StakeService(db).create(
                a,
                StakeCreate(
                    stake_type=StakeType.CONFIRM_MEETUP,
                    amount_mon=5.0,
                    meetup_match_id=match.id,
                ),
            )
    assert exc.value.status_code == 400
    assert "tx_hash" in exc.value.detail


def test_unverifiable_tx_is_rejected(db):
    a, _, match = confirmed_meetup(db)

    with patch(
        "app.services.stake_service.deposit_address",
        return_value="0x000000000000000000000000000000000000dEaD",
    ), patch(
        "app.services.monad_service.MonadService.verify_deposit",
        return_value={"verified": False, "reason": "wrong_recipient", "value_mon": None},
    ):
        with pytest.raises(HTTPException) as exc:
            StakeService(db).create(
                a,
                StakeCreate(
                    stake_type=StakeType.CONFIRM_MEETUP,
                    amount_mon=5.0,
                    meetup_match_id=match.id,
                    tx_hash="0xabc",
                ),
            )
    assert exc.value.status_code == 400
    assert "wrong_recipient" in exc.value.detail
    # A rejected deposit must not leave a row behind.
    assert db.query(Stake).filter(Stake.tx_hash == "0xabc").count() == 0


def test_verified_tx_marks_stake_onchain(db):
    a, _, match = confirmed_meetup(db)

    with patch(
        "app.services.stake_service.deposit_address",
        return_value="0x000000000000000000000000000000000000dEaD",
    ), patch(
        "app.services.monad_service.MonadService.verify_deposit",
        return_value={"verified": True, "reason": "ok", "value_mon": 5.0},
    ):
        stake = StakeService(db).create(
            a,
            StakeCreate(
                stake_type=StakeType.CONFIRM_MEETUP,
                amount_mon=5.0,
                meetup_match_id=match.id,
                tx_hash="0xfeed",
            ),
        )

    assert stake.onchain_verified is True
    # The user's funding hash must survive — not be overwritten by a record tx.
    assert stake.tx_hash == "0xfeed"


def test_deposit_requirements_reports_demo_mode(db):
    reqs = StakeService(db).deposit_requirements(5.0)
    assert reqs["onchain_required"] is False
    assert reqs["deposit_address"] is None
    assert reqs["chain_id"] == 10143
    # Native transfer is always 21,000 — Monad bills the limit, not the usage.
    assert reqs["gas_limit"] == 21_000


def test_deposit_requirements_reports_onchain_mode(db):
    with patch(
        "app.services.stake_service.deposit_address",
        return_value="0x000000000000000000000000000000000000dEaD",
    ):
        reqs = StakeService(db).deposit_requirements(5.0)
    assert reqs["onchain_required"] is True
    assert reqs["deposit_address"] == "0x000000000000000000000000000000000000dEaD"
