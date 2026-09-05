"""
Tests for Celery beat tasks: attestation_tasks, match_tasks, reputation_tasks.
Tasks are called directly (no broker needed) with SQLite in-memory DB.
"""
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_session(db):
    """Return a context-manager-compatible mock that yields the test db."""
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=db)
    cm.__exit__ = MagicMock(return_value=False)
    return cm


def _attestation(db, *, initiator_confirmed=False, counterparty_confirmed=False,
                 expires_at=None):
    """Build an attestation with a real match behind it."""
    from app.models.attestation import (
        AttestationMethod, AttestationStatus, MeetupAttestation,
    )
    from app.models.match import Match, MatchStatus
    from app.models.persona import IntentMode, Persona
    from app.models.user import User

    a = User(id=uuid.uuid4(), wallet_address=f"0x{uuid.uuid4().hex[:38]}")
    b = User(id=uuid.uuid4(), wallet_address=f"0x{uuid.uuid4().hex[:38]}")
    db.add_all([a, b])
    db.flush()

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

    att = MeetupAttestation(
        id=uuid.uuid4(),
        match_id=match.id,
        initiator_user_id=a.id,
        counterparty_user_id=b.id,
        method=AttestationMethod.QR_CODE,
        status=AttestationStatus.PENDING_CONFIRM,
        initiator_confirmed=initiator_confirmed,
        counterparty_confirmed=counterparty_confirmed,
        expires_at=expires_at or (datetime.utcnow() - timedelta(hours=1)),
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


# ── attestation_tasks (R6 / R7) ───────────────────────────────────────────────

class TestRouteExpiredAttestations:
    def test_nothing_stale_returns_zero(self, db):
        from app.tasks.attestation_tasks import route_expired_attestations
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = route_expired_attestations.run()
        assert result["pending_arbitration"] == 0
        assert result["expired"] == 0
        assert result["errors"] == 0

    def test_returns_summary_dict_shape(self, db):
        from app.tasks.attestation_tasks import route_expired_attestations
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = route_expired_attestations.run()
        assert set(result.keys()) == {
            "pending_arbitration", "expired", "errors", "ran_at",
        }

    def test_one_sided_checkin_goes_to_arbitration_not_slashed(self, db):
        """The core PRD §7 rule: a one-sided check-in is never a no-show."""
        from app.models.attestation import AttestationStatus
        from app.tasks.attestation_tasks import route_expired_attestations

        att = _attestation(db, initiator_confirmed=True)

        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = route_expired_attestations.run()

        assert result["pending_arbitration"] == 1
        assert result["expired"] == 0
        db.refresh(att)
        assert att.status == AttestationStatus.PENDING_ARBITRATION
        assert att.notes and "not treated as a no-show" in att.notes

    def test_nobody_checked_in_just_lapses(self, db):
        from app.models.attestation import AttestationStatus
        from app.tasks.attestation_tasks import route_expired_attestations

        att = _attestation(db)

        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = route_expired_attestations.run()

        assert result["expired"] == 1
        assert result["pending_arbitration"] == 0
        db.refresh(att)
        assert att.status == AttestationStatus.EXPIRED

    def test_unexpired_attestation_untouched(self, db):
        from app.models.attestation import AttestationStatus
        from app.tasks.attestation_tasks import route_expired_attestations

        att = _attestation(
            db, initiator_confirmed=True,
            expires_at=datetime.utcnow() + timedelta(hours=2),
        )

        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = route_expired_attestations.run()

        assert result["pending_arbitration"] == 0
        db.refresh(att)
        assert att.status == AttestationStatus.PENDING_CONFIRM

    def test_no_task_can_slash_a_deposit(self, db):
        """Regression guard: the hourly job must never penalise anyone.

        The previous implementation auto-slashed expired escrows, which
        contradicted the PRD. Assert no stake ends up slashed.
        """
        from app.models.stake import Stake, StakeStatus
        from app.tasks.attestation_tasks import route_expired_attestations

        _attestation(db, initiator_confirmed=True)
        _attestation(db)

        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            route_expired_attestations.run()

        assert db.query(Stake).filter(Stake.status == StakeStatus.SLASHED).count() == 0

    def test_error_path_increments_errors(self, db):
        from app.tasks.attestation_tasks import route_expired_attestations

        stale = MagicMock()
        stale.id = uuid.uuid4()
        stale.initiator_confirmed = True
        stale.counterparty_confirmed = False

        db_mock = MagicMock()
        chain = MagicMock()
        chain.all.return_value = [stale]
        db_mock.query.return_value.filter.return_value = chain
        cm = MagicMock()
        cm.__enter__ = MagicMock(return_value=db_mock)
        cm.__exit__ = MagicMock(return_value=False)

        with patch("app.core.database.SessionLocal", return_value=cm), patch(
            "app.services.meetup_attestation_service.MeetupAttestationService"
        ) as MockSvc:
            MockSvc.return_value.mark_pending_arbitration.side_effect = Exception(
                "boom"
            )
            result = route_expired_attestations.run()

        assert result["errors"] == 1


# ── match_tasks ───────────────────────────────────────────────────────────────

class TestExpireStaleMatches:
    def test_no_stale_matches_returns_zero(self, db):
        from app.tasks.match_tasks import expire_stale_matches
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = expire_stale_matches.run()
        assert result["expired"] == 0
        assert result["errors"] == 0
        assert "ran_at" in result

    def test_returns_summary_dict_shape(self, db):
        from app.tasks.match_tasks import expire_stale_matches
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = expire_stale_matches.run()
        assert set(result.keys()) == {"expired", "errors", "ran_at"}

    def test_stale_match_gets_expired(self, db):
        from app.models.user import User
        from app.models.persona import Persona, IntentMode
        from app.models.match import Match, MatchStatus, ConsentState
        import uuid as _uuid

        user_a = User(id=_uuid.uuid4(), wallet_address="w_ma1", is_active=True)
        user_b = User(id=_uuid.uuid4(), wallet_address="w_mb1", is_active=True)
        db.add_all([user_a, user_b])
        db.commit()

        pa = Persona(id=_uuid.uuid4(), user_id=user_a.id, display_name="A",
                     intent_mode=IntentMode.SOCIAL, is_active=True)
        pb = Persona(id=_uuid.uuid4(), user_id=user_b.id, display_name="B",
                     intent_mode=IntentMode.SOCIAL, is_active=True)
        db.add_all([pa, pb])
        db.commit()

        stale = Match(
            id=_uuid.uuid4(),
            requester_persona_id=pa.id,
            target_persona_id=pb.id,
            status=MatchStatus.PENDING,
            consent_state=ConsentState.REQUESTED,
            expires_at=datetime.utcnow() - timedelta(hours=2),
        )
        db.add(stale)
        db.commit()

        from app.tasks.match_tasks import expire_stale_matches
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = expire_stale_matches.run()

        assert result["expired"] == 1
        db.refresh(stale)
        assert stale.status == MatchStatus.EXPIRED

    def test_non_expired_match_not_touched(self, db):
        from app.models.user import User
        from app.models.persona import Persona, IntentMode
        from app.models.match import Match, MatchStatus, ConsentState
        import uuid as _uuid

        user_a = User(id=_uuid.uuid4(), wallet_address="w_ma2", is_active=True)
        user_b = User(id=_uuid.uuid4(), wallet_address="w_mb2", is_active=True)
        db.add_all([user_a, user_b])
        db.commit()

        pa = Persona(id=_uuid.uuid4(), user_id=user_a.id, display_name="A2",
                     intent_mode=IntentMode.SOCIAL, is_active=True)
        pb = Persona(id=_uuid.uuid4(), user_id=user_b.id, display_name="B2",
                     intent_mode=IntentMode.SOCIAL, is_active=True)
        db.add_all([pa, pb])
        db.commit()

        fresh = Match(
            id=_uuid.uuid4(),
            requester_persona_id=pa.id,
            target_persona_id=pb.id,
            status=MatchStatus.PENDING,
            consent_state=ConsentState.REQUESTED,
            expires_at=datetime.utcnow() + timedelta(hours=48),
        )
        db.add(fresh)
        db.commit()

        from app.tasks.match_tasks import expire_stale_matches
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = expire_stale_matches.run()

        assert result["expired"] == 0
        db.refresh(fresh)
        assert fresh.status == MatchStatus.PENDING

    def test_commit_failure_rolls_back(self, db):
        from app.tasks.match_tasks import expire_stale_matches

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.all.return_value = [MagicMock()]
        db_mock.commit.side_effect = Exception("db error")
        cm = MagicMock()
        cm.__enter__ = MagicMock(return_value=db_mock)
        cm.__exit__ = MagicMock(return_value=False)

        with patch("app.core.database.SessionLocal", return_value=cm):
            result = expire_stale_matches.run()

        assert result["expired"] == 0
        assert result["errors"] >= 1
        db_mock.rollback.assert_called_once()


# ── reputation_tasks ──────────────────────────────────────────────────────────

class TestApplyReputationDecay:
    def _make_score(self, db, user_id, value=80.0, last_decay_at=None):
        from app.models.reputation import ReputationScore
        score = ReputationScore(
            id=uuid.uuid4(),
            user_id=user_id,
            reliability_score=value,
            safety_score=value,
            response_score=value,
            meetup_completion_score=value,
            consent_confirmation_score=value,
            composite_score=value,
            last_decay_at=last_decay_at,
        )
        db.add(score)
        db.commit()
        db.refresh(score)
        return score

    def test_no_scores_returns_zero(self, db):
        from app.tasks.reputation_tasks import apply_reputation_decay
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = apply_reputation_decay.run()
        assert result["updated"] == 0
        assert result["errors"] == 0
        assert "ran_at" in result

    def test_returns_summary_dict_shape(self, db):
        from app.tasks.reputation_tasks import apply_reputation_decay
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = apply_reputation_decay.run()
        assert set(result.keys()) == {"updated", "errors", "ran_at"}

    def test_score_above_midpoint_decays_down(self, db):
        from app.models.user import User
        user = User(id=uuid.uuid4(), wallet_address="w_decay1", is_active=True)
        db.add(user)
        db.commit()
        score = self._make_score(db, user.id, value=80.0, last_decay_at=None)

        from app.tasks.reputation_tasks import apply_reputation_decay
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = apply_reputation_decay.run()

        assert result["updated"] == 1
        db.refresh(score)
        # 80.0 → nudged toward 50.0, so should be < 80.0
        assert score.reliability_score < 80.0
        assert score.last_decay_at is not None

    def test_score_below_midpoint_decays_up(self, db):
        from app.models.user import User
        user = User(id=uuid.uuid4(), wallet_address="w_decay2", is_active=True)
        db.add(user)
        db.commit()
        score = self._make_score(db, user.id, value=20.0, last_decay_at=None)

        from app.tasks.reputation_tasks import apply_reputation_decay
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = apply_reputation_decay.run()

        assert result["updated"] == 1
        db.refresh(score)
        assert score.reliability_score > 20.0

    def test_recently_decayed_score_skipped(self, db):
        from app.models.user import User
        user = User(id=uuid.uuid4(), wallet_address="w_decay3", is_active=True)
        db.add(user)
        db.commit()
        # Set last_decay_at to just 1 day ago — within threshold (7 days)
        self._make_score(db, user.id, value=80.0,
                         last_decay_at=datetime.utcnow() - timedelta(days=1))

        from app.tasks.reputation_tasks import apply_reputation_decay
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            result = apply_reputation_decay.run()

        assert result["updated"] == 0

    def test_composite_score_recomputed(self, db):
        from app.models.user import User
        user = User(id=uuid.uuid4(), wallet_address="w_decay4", is_active=True)
        db.add(user)
        db.commit()
        score = self._make_score(db, user.id, value=80.0, last_decay_at=None)

        from app.tasks.reputation_tasks import apply_reputation_decay
        with patch("app.core.database.SessionLocal", return_value=_make_session(db)):
            apply_reputation_decay.run()

        db.refresh(score)
        expected = round(sum([
            score.reliability_score, score.safety_score, score.response_score,
            score.meetup_completion_score, score.consent_confirmation_score
        ]) / 5, 4)
        assert abs(score.composite_score - expected) < 0.001

    def test_commit_failure_rolls_back(self, db):
        from app.tasks.reputation_tasks import apply_reputation_decay

        mock_record = MagicMock()
        mock_record.reliability_score = 75.0
        mock_record.safety_score = 75.0
        mock_record.response_score = 75.0
        mock_record.meetup_completion_score = 75.0
        mock_record.consent_confirmation_score = 75.0

        db_mock = MagicMock()
        db_mock.query.return_value.filter.return_value.all.return_value = [mock_record]
        db_mock.commit.side_effect = Exception("db down")
        cm = MagicMock()
        cm.__enter__ = MagicMock(return_value=db_mock)
        cm.__exit__ = MagicMock(return_value=False)

        with patch("app.core.database.SessionLocal", return_value=cm):
            result = apply_reputation_decay.run()

        assert result["updated"] == 0
        assert result["errors"] >= 1
        db_mock.rollback.assert_called_once()
