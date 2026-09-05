"""
Tests for R1 (发起-匹配-确认), R10 (安全偏好硬过滤), R11 (历史履约特征).
"""
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app.models.block import Block
from app.models.fulfilment_credential import CreditProfile
from app.models.meetup_request import (
    GenderPreference, MeetupMatchStatus, MeetupRequestStatus, SceneType, VenueType,
)
from app.models.reputation import ReputationScore
from app.models.user import Gender, User, VerificationLevel
from app.schemas.meetup_request import MeetupRequestCreate
from app.services.meetup_request_service import MeetupRequestService
from app.services.preference_memory_service import PreferenceMemoryService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(
    db,
    gender: Gender = Gender.FEMALE,
    level: VerificationLevel = VerificationLevel.ID,
) -> User:
    user = User(
        id=uuid.uuid4(),
        wallet_address=f"0x{uuid.uuid4().hex[:38]}",
        gender=gender,
        verification_level=level,
    )
    db.add(user)
    db.flush()
    return user


def payload(
    scene: SceneType = SceneType.DINING,
    venue_key: str = "mall-taikoo-li",
    duration: int = 60,
    start: datetime | None = None,
    **kwargs,
) -> MeetupRequestCreate:
    return MeetupRequestCreate(
        venue_type=VenueType.MALL,
        venue_name="Taikoo Li Mall",
        venue_key=venue_key,
        scene=scene,
        duration_minutes=duration,
        window_start=start,
        **kwargs,
    )


def credit(db, user: User, kept: int, scenes: dict | None = None, slots: dict | None = None):
    profile = CreditProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        fulfilled_count=kept,
        credit_score=min(100.0, 50.0 + kept * 8.0),
        scene_preference=scenes or {},
        time_slot_preference=slots or {},
    )
    db.add(profile)
    db.flush()
    return profile


# ---------------------------------------------------------------------------
# R1 — request lifecycle
# ---------------------------------------------------------------------------

def test_create_request_sets_window_from_duration(db):
    user = make_user(db)
    svc = MeetupRequestService(db)

    request = svc.create(user, payload(duration=90))

    assert request.status == MeetupRequestStatus.OPEN
    assert request.venue_key == "mall-taikoo-li"
    delta = (request.window_end - request.window_start).total_seconds() / 60
    assert abs(delta - 90) < 0.01


def test_unverified_user_cannot_create_request(db):
    user = make_user(db, level=VerificationLevel.WALLET)
    svc = MeetupRequestService(db)

    with pytest.raises(HTTPException) as exc:
        svc.create(user, payload())
    assert exc.value.status_code == 403


def test_only_one_active_request_per_user(db):
    user = make_user(db)
    svc = MeetupRequestService(db)
    svc.create(user, payload())

    with pytest.raises(HTTPException) as exc:
        svc.create(user, payload(scene=SceneType.SHOPPING))
    assert exc.value.status_code == 409


def test_same_gender_only_requires_declared_gender(db):
    user = make_user(db, gender=Gender.UNDISCLOSED)
    svc = MeetupRequestService(db)

    with pytest.raises(HTTPException) as exc:
        svc.create(user, payload(gender_preference=GenderPreference.SAME_ONLY))
    assert exc.value.status_code == 400


def test_cancel_reopens_nothing_and_marks_cancelled(db):
    user = make_user(db)
    svc = MeetupRequestService(db)
    request = svc.create(user, payload())

    cancelled = svc.cancel(user, request.id)
    assert cancelled.status == MeetupRequestStatus.CANCELLED


# ---------------------------------------------------------------------------
# R1 — candidate matching hard constraints
# ---------------------------------------------------------------------------

def test_candidate_must_share_venue(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(venue_key="mall-a"))
    svc.create(b, payload(venue_key="mall-b"))

    assert svc.find_candidates(a, req_a.id) == []


def test_candidate_must_share_scene(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(scene=SceneType.DINING))
    svc.create(b, payload(scene=SceneType.SHOPPING))

    assert svc.find_candidates(a, req_a.id) == []


def test_candidate_must_overlap_time_window(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    now = datetime.utcnow()
    req_a = svc.create(a, payload(start=now, duration=30))
    # Starts after A's window closes
    svc.create(b, payload(start=now + timedelta(minutes=45), duration=30))

    assert svc.find_candidates(a, req_a.id) == []


def test_matching_candidate_surfaces_with_reasons(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    req_b = svc.create(b, payload())

    results = svc.find_candidates(a, req_a.id)

    assert len(results) == 1
    assert results[0]["counterpart_request_id"] == req_b.id
    assert results[0]["score"] > 0
    # PRD R2: the match must be explainable
    assert any("Taikoo Li Mall" in r for r in results[0]["reasons"])
    assert results[0]["verified"] is True


def test_blocked_user_never_surfaces(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    svc.create(b, payload())

    db.add(Block(id=uuid.uuid4(), blocker_id=b.id, blocked_id=a.id))
    db.flush()

    # Block is bidirectional: B blocked A, so A must not see B either.
    assert svc.find_candidates(a, req_a.id) == []


# ---------------------------------------------------------------------------
# R10 — safety preferences are hard filters, both directions
# ---------------------------------------------------------------------------

def test_same_gender_only_excludes_other_gender(db):
    a = make_user(db, gender=Gender.FEMALE)
    b = make_user(db, gender=Gender.MALE)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(gender_preference=GenderPreference.SAME_ONLY))
    svc.create(b, payload())

    assert svc.find_candidates(a, req_a.id) == []


def test_same_gender_only_allows_same_gender(db):
    a = make_user(db, gender=Gender.FEMALE)
    b = make_user(db, gender=Gender.FEMALE)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(gender_preference=GenderPreference.SAME_ONLY))
    req_b = svc.create(b, payload())

    results = svc.find_candidates(a, req_a.id)
    assert [r["counterpart_request_id"] for r in results] == [req_b.id]


def test_counterparts_preference_also_enforced(db):
    """A has no preference, but B requires same-gender — B must be filtered out."""
    a = make_user(db, gender=Gender.MALE)
    b = make_user(db, gender=Gender.FEMALE)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    svc.create(b, payload(gender_preference=GenderPreference.SAME_ONLY))

    assert svc.find_candidates(a, req_a.id) == []


def test_require_verified_excludes_unverified_candidate(db):
    a = make_user(db)
    b = make_user(db, level=VerificationLevel.PHONE)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(require_verified=True))
    req_b = svc.create(b, payload())

    # PHONE counts as verified
    assert len(svc.find_candidates(a, req_a.id)) == 1

    b.verification_level = VerificationLevel.WALLET
    db.flush()
    # Now unverified — but an unverified user also can't hold an open request,
    # so assert via the safety filter directly.
    assert svc.find_candidates(a, req_a.id) == []


def test_min_reputation_filter_excludes_low_score(db):
    a, b = make_user(db), make_user(db)
    db.add(ReputationScore(id=uuid.uuid4(), user_id=b.id, composite_score=30.0))
    db.flush()

    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(min_reputation_score=60.0))
    svc.create(b, payload())

    assert svc.find_candidates(a, req_a.id) == []


# ---------------------------------------------------------------------------
# R11 — history affinity
# ---------------------------------------------------------------------------

def test_history_affinity_ignored_below_threshold(db):
    a, b = make_user(db), make_user(db)
    credit(db, a, kept=1, scenes={"dining": 1})
    credit(db, b, kept=1, scenes={"dining": 1})

    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    svc.create(b, payload())

    result = svc.find_candidates(a, req_a.id)[0]
    # Neutral 0.5 because neither side has >= 3 fulfilments yet
    assert result["breakdown"]["history_affinity"] == 0.5


def test_shared_habits_rank_above_dissimilar_habits(db):
    a = make_user(db)
    similar = make_user(db)
    different = make_user(db)

    credit(db, a, kept=5, scenes={"dining": 5}, slots={"evening": 5})
    credit(db, similar, kept=5, scenes={"dining": 5}, slots={"evening": 5})
    credit(db, different, kept=5, scenes={"shopping": 5}, slots={"morning": 5})

    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    req_similar = svc.create(similar, payload())
    svc.create(different, payload())

    results = svc.find_candidates(a, req_a.id)
    assert results[0]["counterpart_request_id"] == req_similar.id
    assert results[0]["breakdown"]["history_affinity"] > results[-1]["breakdown"][
        "history_affinity"
    ]


def test_shared_interests_raise_preference_similarity(db):
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    pref.store(a.id, {"interests": ["food", "music"], "personality_traits": []})
    pref.store(b.id, {"interests": ["food", "music"], "personality_traits": []})

    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    svc.create(b, payload())

    result = svc.find_candidates(a, req_a.id)[0]
    assert result["breakdown"]["preference_similarity"] > 0.9
    assert any("Shared interests" in r for r in result["reasons"])


# ---------------------------------------------------------------------------
# R1 — two-sided confirmation handshake
# ---------------------------------------------------------------------------

def test_propose_then_accept_confirms_both_sides(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    req_b = svc.create(b, payload())

    match = svc.propose(a, req_a.id, req_b.id)
    assert match.status == MeetupMatchStatus.ACCEPTED
    assert match.requester_accepted is True
    assert match.counterpart_accepted is False

    confirmed = svc.respond(b, match.id, accept=True)
    assert confirmed.status == MeetupMatchStatus.CONFIRMED
    assert confirmed.confirmed_at is not None

    db.refresh(req_a)
    db.refresh(req_b)
    assert req_a.status == MeetupRequestStatus.CONFIRMED
    assert req_b.status == MeetupRequestStatus.CONFIRMED


def test_declining_reopens_requests_without_penalty(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    req_b = svc.create(b, payload())

    match = svc.propose(a, req_a.id, req_b.id)
    declined = svc.respond(b, match.id, accept=False)

    assert declined.status == MeetupMatchStatus.DECLINED
    db.refresh(req_a)
    db.refresh(req_b)
    # PRD §7 step 4: refusal ends the flow and leaves both free to rematch
    assert req_a.status == MeetupRequestStatus.OPEN
    assert req_b.status == MeetupRequestStatus.OPEN


def test_outsider_cannot_respond_to_match(db):
    a, b, c = make_user(db), make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload())
    req_b = svc.create(b, payload())
    match = svc.propose(a, req_a.id, req_b.id)

    with pytest.raises(HTTPException) as exc:
        svc.respond(c, match.id, accept=True)
    assert exc.value.status_code == 403


def test_propose_rejects_candidate_failing_safety_preferences(db):
    a = make_user(db, gender=Gender.FEMALE)
    b = make_user(db, gender=Gender.MALE)
    svc = MeetupRequestService(db)
    req_a = svc.create(a, payload(gender_preference=GenderPreference.SAME_ONLY))
    req_b = svc.create(b, payload())

    with pytest.raises(HTTPException) as exc:
        svc.propose(a, req_a.id, req_b.id)
    assert exc.value.status_code == 400


def test_expired_window_marks_request_expired(db):
    user = make_user(db)
    svc = MeetupRequestService(db)
    request = svc.create(
        user, payload(start=datetime.utcnow() - timedelta(hours=3), duration=30)
    )

    svc.list_mine(user)
    db.refresh(request)
    assert request.status == MeetupRequestStatus.EXPIRED
