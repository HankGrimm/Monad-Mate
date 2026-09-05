"""
Tests for R2 — 玄学/人格 and realistic matching dimensions.

Also pins down what is deliberately absent: 八字 and 塔罗 are not implemented, and
these tests assert the scorer doesn't quietly invent them.
"""
import uuid
from datetime import date

from app.models.user import User, VerificationLevel
from app.services.persona_affinity_service import (
    chinese_zodiac, normalise_mbti, persona_affinity, zodiac_element, zodiac_sign,
)
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


# ---------------------------------------------------------------------------
# 星座
# ---------------------------------------------------------------------------

def test_zodiac_sign_boundaries():
    assert zodiac_sign(date(1996, 3, 21)) == "aries"
    assert zodiac_sign(date(1996, 3, 20)) == "pisces"
    assert zodiac_sign(date(1996, 12, 22)) == "capricorn"
    # Early January falls back to Capricorn, before the Aquarius boundary.
    assert zodiac_sign(date(1996, 1, 5)) == "capricorn"
    assert zodiac_sign(date(1996, 1, 20)) == "aquarius"


def test_zodiac_elements():
    assert zodiac_element("aries") == "fire"
    assert zodiac_element("taurus") == "earth"
    assert zodiac_element("gemini") == "air"
    assert zodiac_element("cancer") == "water"


def test_same_element_scores_above_opposing(db):
    a, b, c = make_user(db), make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    # Both fire
    fire_a = pref.store(a.id, {"birth_date": "1996-03-25"})
    fire_b = pref.store(b.id, {"birth_date": "1996-07-25"})
    # Water, opposing fire
    water = pref.store(c.id, {"birth_date": "1996-07-01"})

    same, _ = persona_affinity(fire_a, fire_b)
    opposing, _ = persona_affinity(fire_a, water)
    assert same > opposing


# ---------------------------------------------------------------------------
# 生肖
# ---------------------------------------------------------------------------

def test_chinese_zodiac_animals():
    assert chinese_zodiac(date(1996, 6, 1)) == "rat"
    assert chinese_zodiac(date(1997, 6, 1)) == "ox"
    assert chinese_zodiac(date(2000, 6, 1)) == "dragon"


def test_trine_scores_above_clash(db):
    a, b, c = make_user(db), make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    # Rat and Dragon are a trine
    rat = pref.store(a.id, {"birth_date": "1996-06-01"})
    dragon = pref.store(b.id, {"birth_date": "2000-06-01"})
    # Rat and Horse clash
    horse = pref.store(c.id, {"birth_date": "2002-06-01"})

    trine, _ = persona_affinity(rat, dragon)
    clash, _ = persona_affinity(rat, horse)
    assert trine > clash


# ---------------------------------------------------------------------------
# MBTI
# ---------------------------------------------------------------------------

def test_mbti_normalisation():
    assert normalise_mbti("infj") == "INFJ"
    assert normalise_mbti(" ENTP ") == "ENTP"
    assert normalise_mbti("XXXX") is None
    assert normalise_mbti("INF") is None
    assert normalise_mbti(None) is None


def test_malformed_mbti_is_dropped_not_stored(db):
    user = make_user(db)
    prefs = PreferenceMemoryService(db).store(user.id, {"mbti": "NOPE"})
    assert prefs.mbti is None


def test_shared_middle_letters_score_higher(db):
    a, b, c = make_user(db), make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    infj = pref.store(a.id, {"mbti": "INFJ"})
    enfp = pref.store(b.id, {"mbti": "ENFP"})   # shares N and F
    istp = pref.store(c.id, {"mbti": "ISTP"})   # shares neither

    close, _ = persona_affinity(infj, enfp)
    distant, _ = persona_affinity(infj, istp)
    assert close > distant


# ---------------------------------------------------------------------------
# 作息 and realistic overlap
# ---------------------------------------------------------------------------

def test_matching_sleep_schedule_beats_mismatch(db):
    a, b, c = make_user(db), make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    early_a = pref.store(a.id, {"sleep_schedule": "early"})
    early_b = pref.store(b.id, {"sleep_schedule": "early"})
    night = pref.store(c.id, {"sleep_schedule": "night"})

    same, _ = persona_affinity(early_a, early_b)
    different, _ = persona_affinity(early_a, night)
    assert same > different


def test_flexible_schedule_never_penalised(db):
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    flexible = pref.store(a.id, {"sleep_schedule": "flexible"})
    night = pref.store(b.id, {"sleep_schedule": "night"})

    score, _ = persona_affinity(flexible, night)
    assert score >= 0.8


def test_same_industry_and_city_surface_as_reasons(db):
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    pa = pref.store(a.id, {"industry": "design", "city": "Beijing"})
    pb = pref.store(b.id, {"industry": "design", "city": "Beijing"})

    _, reasons = persona_affinity(pa, pb)
    blob = " ".join(reasons).lower()
    assert "industry" in blob
    assert "city" in blob


# ---------------------------------------------------------------------------
# Neutrality and explainability
# ---------------------------------------------------------------------------

def test_empty_profiles_are_neutral_not_penalised(db):
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    pa = pref.store(a.id, {"interests": ["food"]})
    pb = pref.store(b.id, {"interests": ["food"]})

    score, reasons = persona_affinity(pa, pb)
    assert score == 0.5
    assert reasons == []


def test_partial_profiles_only_score_shared_dimensions(db):
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    # Only A states MBTI, so it must not contribute at all.
    pa = pref.store(a.id, {"mbti": "INFJ", "sleep_schedule": "early"})
    pb = pref.store(b.id, {"sleep_schedule": "early"})

    score, reasons = persona_affinity(pa, pb)
    assert score == 1.0  # schedule matched, MBTI ignored
    assert not any("INFJ" in r for r in reasons)


def test_affinity_always_returns_reasons_it_can_justify(db):
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    pa = pref.store(a.id, {"birth_date": "1996-03-25", "mbti": "INFJ"})
    pb = pref.store(b.id, {"birth_date": "1996-07-25", "mbti": "ENFP"})

    score, reasons = persona_affinity(pa, pb)
    assert 0.0 <= score <= 1.0
    # R2 requires the match to be explainable.
    assert len(reasons) >= 1


def test_bazi_and_tarot_are_not_silently_faked(db):
    """These PRD dimensions are intentionally unimplemented.

    A 八字 reading needs a birth time and solar-term calendar; a tarot draw is
    random per reading. Approximating either would produce an invented number, so
    the scorer must not claim them.
    """
    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    pa = pref.store(a.id, {"birth_date": "1996-03-25"})
    pb = pref.store(b.id, {"birth_date": "1996-07-25"})

    _, reasons = persona_affinity(pa, pb)
    blob = " ".join(reasons).lower()
    for term in ("bazi", "八字", "tarot", "塔罗"):
        assert term not in blob


def test_persona_appears_in_candidate_breakdown(db):
    """The dimension must be visible in the match explanation, not hidden."""
    from app.models.meetup_request import SceneType, VenueType
    from app.schemas.meetup_request import MeetupRequestCreate
    from app.services.meetup_request_service import MeetupRequestService

    a, b = make_user(db), make_user(db)
    pref = PreferenceMemoryService(db)
    pref.store(a.id, {"birth_date": "1996-03-25", "mbti": "INFJ"})
    pref.store(b.id, {"birth_date": "1996-07-25", "mbti": "ENFP"})

    svc = MeetupRequestService(db)
    body = MeetupRequestCreate(
        venue_type=VenueType.MALL,
        venue_name="Taikoo Li Mall",
        venue_key="mall-taikoo-li",
        scene=SceneType.DINING,
        duration_minutes=60,
    )
    ra = svc.create(a, body)
    svc.create(b, body)

    result = svc.find_candidates(a, ra.id)[0]
    assert "persona_affinity" in result["breakdown"]
    assert 0.0 <= result["breakdown"]["persona_affinity"] <= 1.0
