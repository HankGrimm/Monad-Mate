"""
Tests for R3 — AI 社交/游玩方案生成.

The LLM path is not exercised against the live API; these cover the fallback,
validation and the regulatory constraint that the output stays tool-like.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.models.meetup_plan import MeetupPlan, PlanSource
from app.models.meetup_request import MeetupMatchStatus, SceneType, VenueType
from app.models.user import User, VerificationLevel
from app.schemas.meetup_request import MeetupRequestCreate
from app.services.meetup_plan_service import (
    MeetupPlanService, _template_plan, _validate_plan,
)
from app.services.meetup_request_service import MeetupRequestService
from app.services.preference_memory_service import PreferenceMemoryService


def make_user(db) -> User:
    user = User(
        id=uuid.uuid4(),
        wallet_address=f"0x{uuid.uuid4().hex[:38]}",
        verification_level=VerificationLevel.ID,
    )
    db.add(user)
    db.flush()
    return user


def payload(scene: SceneType = SceneType.DINING, duration: int = 60):
    return MeetupRequestCreate(
        venue_type=VenueType.MALL,
        venue_name="Taikoo Li Mall",
        venue_key="mall-taikoo-li",
        scene=scene,
        duration_minutes=duration,
    )


def confirmed_match(db, scene: SceneType = SceneType.DINING, duration: int = 60):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    ra = svc.create(a, payload(scene, duration))
    rb = svc.create(b, payload(scene, duration))
    match = svc.propose(a, ra.id, rb.id)
    svc.respond(b, match.id, accept=True)
    db.refresh(match)
    return a, b, match


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

def test_plan_generated_on_first_access(db):
    a, _, match = confirmed_match(db)
    plan = MeetupPlanService(db).get_or_create(a, match.id)

    assert plan.match_id == match.id
    assert len(plan.icebreakers) >= 1
    assert len(plan.itinerary) >= 1
    assert plan.mini_game.get("name")
    # No AINative key in tests, so the deterministic path must have run.
    assert plan.source == PlanSource.TEMPLATE


def test_plan_is_reused_not_regenerated(db):
    a, _, match = confirmed_match(db)
    svc = MeetupPlanService(db)

    first = svc.get_or_create(a, match.id)
    second = svc.get_or_create(a, match.id)

    assert first.id == second.id
    assert db.query(MeetupPlan).count() == 1


def test_both_participants_see_the_same_plan(db):
    a, b, match = confirmed_match(db)
    svc = MeetupPlanService(db)

    assert svc.get_or_create(a, match.id).id == svc.get_or_create(b, match.id).id


def test_plan_requires_confirmed_match(db):
    a, b = make_user(db), make_user(db)
    svc = MeetupRequestService(db)
    ra = svc.create(a, payload())
    rb = svc.create(b, payload())
    match = svc.propose(a, ra.id, rb.id)  # only one side accepted

    assert match.status == MeetupMatchStatus.ACCEPTED
    with pytest.raises(HTTPException) as exc:
        MeetupPlanService(db).get_or_create(a, match.id)
    assert exc.value.status_code == 400


def test_outsider_cannot_read_plan(db):
    a, _, match = confirmed_match(db)
    outsider = make_user(db)
    MeetupPlanService(db).get_or_create(a, match.id)

    with pytest.raises(HTTPException) as exc:
        MeetupPlanService(db).get_or_create(outsider, match.id)
    assert exc.value.status_code == 403


def test_regenerate_replaces_the_plan(db):
    a, _, match = confirmed_match(db)
    svc = MeetupPlanService(db)
    first = svc.get_or_create(a, match.id)
    second = svc.regenerate(a, match.id)

    assert first.id != second.id
    assert db.query(MeetupPlan).count() == 1


def test_adoption_is_tracked(db):
    a, _, match = confirmed_match(db)
    svc = MeetupPlanService(db)
    svc.get_or_create(a, match.id)

    adopted = svc.mark_adopted(a, match.id)
    assert adopted.adopted is True
    assert adopted.adopted_at is not None


# ---------------------------------------------------------------------------
# Content quality
# ---------------------------------------------------------------------------

def test_shared_interest_leads_the_icebreakers(db):
    a, b, match = confirmed_match(db)
    pref = PreferenceMemoryService(db)
    pref.store(a.id, {"interests": ["hotpot", "gaming"], "personality_traits": []})
    pref.store(b.id, {"interests": ["hotpot", "reading"], "personality_traits": []})

    plan = MeetupPlanService(db).get_or_create(a, match.id)

    assert "hotpot" in plan.shared_interests
    assert "hotpot" in plan.icebreakers[0].lower()


def test_itinerary_fits_the_requested_duration(db):
    a, _, match = confirmed_match(db, duration=30)
    plan = MeetupPlanService(db).get_or_create(a, match.id)

    assert all(step["minute"] <= 30 for step in plan.itinerary)


def test_each_scene_gets_its_own_plan(db):
    dining = _template_plan(
        scene=SceneType.DINING, venue_name="V", duration=60, shared_interests=[]
    )
    shopping = _template_plan(
        scene=SceneType.SHOPPING, venue_name="V", duration=60, shared_interests=[]
    )

    assert dining["icebreakers"] != shopping["icebreakers"]
    assert dining["mini_game"]["name"] != shopping["mini_game"]["name"]


def test_templates_contain_no_companion_style_content(db):
    """PRD/regulatory constraint: the generator is a tool, not a companion."""
    banned = [
        "love", "romantic", "flirt", "date night", "soulmate", "i feel",
        "i'm here for you", "cuddle", "intimate",
    ]
    for scene in (SceneType.DINING, SceneType.ENTERTAINMENT, SceneType.SHOPPING):
        plan = _template_plan(
            scene=scene, venue_name="V", duration=60, shared_interests=[]
        )
        blob = " ".join(
            plan["icebreakers"]
            + [s["title"] + " " + s["detail"] for s in plan["itinerary"]]
            + [plan["mini_game"]["name"], plan["mini_game"]["how_to_play"]]
        ).lower()
        for term in banned:
            assert term not in blob, f"{scene.value} plan contains '{term}'"


# ---------------------------------------------------------------------------
# LLM output validation
# ---------------------------------------------------------------------------

def test_validate_accepts_well_formed_output():
    result = _validate_plan(
        {
            "icebreakers": ["A", "B"],
            "itinerary": [{"minute": 0, "title": "Start", "detail": "Go"}],
            "mini_game": {"name": "G", "how_to_play": "Play"},
        },
        60,
    )
    assert result is not None
    assert result["icebreakers"] == ["A", "B"]
    assert result["mini_game"]["name"] == "G"


def test_validate_rejects_empty_content():
    assert _validate_plan({"icebreakers": [], "itinerary": []}, 60) is None


def test_validate_drops_steps_beyond_the_duration():
    result = _validate_plan(
        {
            "icebreakers": ["A"],
            "itinerary": [
                {"minute": 10, "title": "Inside", "detail": ""},
                {"minute": 500, "title": "Way past the end", "detail": ""},
            ],
            "mini_game": {"name": "G", "how_to_play": "P"},
        },
        60,
    )
    assert result is not None
    assert [s["minute"] for s in result["itinerary"]] == [10]


def test_validate_sorts_itinerary_by_time():
    result = _validate_plan(
        {
            "icebreakers": ["A"],
            "itinerary": [
                {"minute": 30, "title": "Later", "detail": ""},
                {"minute": 0, "title": "Earlier", "detail": ""},
            ],
            "mini_game": {"name": "G", "how_to_play": "P"},
        },
        60,
    )
    assert [s["minute"] for s in result["itinerary"]] == [0, 30]


def test_validate_tolerates_malformed_steps():
    result = _validate_plan(
        {
            "icebreakers": ["A"],
            "itinerary": [
                "not a dict",
                {"minute": "abc", "title": "Bad minute"},
                {"minute": 5, "title": ""},
                {"minute": 5, "title": "Good", "detail": "ok"},
            ],
            "mini_game": "also not a dict",
        },
        60,
    )
    assert result is not None
    assert len(result["itinerary"]) == 1
    assert result["mini_game"] == {}
