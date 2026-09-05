"""
Persona affinity — the 玄学/人格 half of R2.

The PRD asks for 星座, 生肖, 八字, 塔罗, MBTI and 性格 as matching inputs. What is
implemented here, and what is deliberately not:

* **星座 (zodiac sign)** — derived from the birth date. Element compatibility
  (fire/earth/air/water) is a widely recognised convention, so it produces a
  score users can sanity-check.
* **生肖 (Chinese zodiac)** — derived from the birth year, using the traditional
  三合 (trine) groupings.
* **MBTI** — scored on complementary vs identical letter patterns.
* **作息 (sleep schedule)** — a practical proxy the PRD lists alongside the
  persona traits; an early riser and a night owl genuinely struggle to share an
  evening slot.
* **八字 (BaZi)** — not implemented. A real 八字 reading needs a solar-term
  calendar and a birth *time*, and any cheap approximation would be a fabricated
  number dressed up as a system. Left out rather than faked.
* **塔罗 (tarot)** — not implemented. A tarot draw is random per reading, so it
  cannot be a stable matching feature. Including it would add noise, not signal.

Everything here is a **soft ranking signal**. None of it can override a hard
constraint, and the PRD is explicit that whether these dimensions actually
predict follow-through is unvalidated — the weight is deliberately modest.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

# ---------------------------------------------------------------------------
# 星座 (Western zodiac)
# ---------------------------------------------------------------------------

# (month, day) lower bound for each sign, in calendar order.
_SIGN_BOUNDS: list[tuple[int, int, str]] = [
    (1, 20, "aquarius"),
    (2, 19, "pisces"),
    (3, 21, "aries"),
    (4, 20, "taurus"),
    (5, 21, "gemini"),
    (6, 21, "cancer"),
    (7, 23, "leo"),
    (8, 23, "virgo"),
    (9, 23, "libra"),
    (10, 23, "scorpio"),
    (11, 22, "sagittarius"),
    (12, 22, "capricorn"),
]

_SIGN_ELEMENT = {
    "aries": "fire", "leo": "fire", "sagittarius": "fire",
    "taurus": "earth", "virgo": "earth", "capricorn": "earth",
    "gemini": "air", "libra": "air", "aquarius": "air",
    "cancer": "water", "scorpio": "water", "pisces": "water",
}

# Same element is most compatible; the classic pairings are fire/air and
# earth/water.
_ELEMENT_AFFINITY = {
    ("fire", "fire"): 1.0, ("air", "air"): 1.0,
    ("earth", "earth"): 1.0, ("water", "water"): 1.0,
    ("fire", "air"): 0.85, ("air", "fire"): 0.85,
    ("earth", "water"): 0.85, ("water", "earth"): 0.85,
    ("fire", "earth"): 0.5, ("earth", "fire"): 0.5,
    ("air", "water"): 0.5, ("water", "air"): 0.5,
    ("fire", "water"): 0.35, ("water", "fire"): 0.35,
    ("earth", "air"): 0.35, ("air", "earth"): 0.35,
}


def zodiac_sign(born: date) -> str:
    """Western zodiac sign for a birth date."""
    sign = "capricorn"  # dates before Jan 20 fall here
    for month, day, name in _SIGN_BOUNDS:
        if (born.month, born.day) >= (month, day):
            sign = name
    return sign


def zodiac_element(sign: str) -> Optional[str]:
    return _SIGN_ELEMENT.get(sign)


# ---------------------------------------------------------------------------
# 生肖 (Chinese zodiac)
# ---------------------------------------------------------------------------

_ANIMALS = [
    "rat", "ox", "tiger", "rabbit", "dragon", "snake",
    "horse", "goat", "monkey", "rooster", "dog", "pig",
]

# 三合 — the traditional compatible trines.
_TRINES = [
    {"rat", "dragon", "monkey"},
    {"ox", "snake", "rooster"},
    {"tiger", "horse", "dog"},
    {"rabbit", "goat", "pig"},
]

# 六冲 — the traditional opposing pairs (six positions apart).
_CLASHES = {
    frozenset({"rat", "horse"}),
    frozenset({"ox", "goat"}),
    frozenset({"tiger", "monkey"}),
    frozenset({"rabbit", "rooster"}),
    frozenset({"dragon", "dog"}),
    frozenset({"snake", "pig"}),
}


def chinese_zodiac(born: date) -> str:
    """生肖 for a birth year.

    Uses the Gregorian year, which is off for people born in January or early
    February before Chinese New Year. Correcting that needs a lunar calendar;
    the approximation is noted rather than hidden.
    """
    return _ANIMALS[(born.year - 1900) % 12]


def _animal_affinity(a: str, b: str) -> float:
    if a == b:
        return 0.8
    if frozenset({a, b}) in _CLASHES:
        return 0.3
    for trine in _TRINES:
        if a in trine and b in trine:
            return 1.0
    return 0.6


# ---------------------------------------------------------------------------
# MBTI
# ---------------------------------------------------------------------------

_MBTI_RE_LETTERS = [("I", "E"), ("N", "S"), ("F", "T"), ("J", "P")]


def normalise_mbti(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = value.strip().upper()
    if len(v) != 4:
        return None
    for i, pair in enumerate(_MBTI_RE_LETTERS):
        if v[i] not in pair:
            return None
    return v


def _mbti_affinity(a: str, b: str) -> float:
    """Score on letter agreement.

    Shared middle letters (N/S, F/T) tend to make conversation easier, while
    differing E/I and J/P are often complementary. Weighted accordingly rather
    than counting raw matches.
    """
    weights = [0.15, 0.35, 0.35, 0.15]
    score = 0.0
    for i, weight in enumerate(weights):
        if a[i] == b[i]:
            score += weight
        elif i in (0, 3):
            # Different E/I or J/P — treated as complementary, not a penalty.
            score += weight * 0.8
    return min(1.0, score)


# ---------------------------------------------------------------------------
# 作息 (sleep schedule)
# ---------------------------------------------------------------------------

_SCHEDULES = {"early", "night", "flexible"}


def _schedule_affinity(a: str, b: str) -> float:
    if "flexible" in (a, b):
        return 0.85
    return 1.0 if a == b else 0.4


# ---------------------------------------------------------------------------
# Combined
# ---------------------------------------------------------------------------

def persona_affinity(prefs_a, prefs_b) -> tuple[float, list[str]]:
    """Blend the available persona signals into one 0-1 score.

    Only the dimensions both users filled in contribute; the score is the mean of
    those, so a user who fills nothing in gets a neutral 0.5 rather than being
    penalised for it. Returns the score plus human-readable reasons, since R2
    requires the match to be explainable.
    """
    components: list[float] = []
    reasons: list[str] = []

    a_date = getattr(prefs_a, "birth_date", None)
    b_date = getattr(prefs_b, "birth_date", None)

    if a_date and b_date:
        sign_a, sign_b = zodiac_sign(a_date), zodiac_sign(b_date)
        el_a, el_b = zodiac_element(sign_a), zodiac_element(sign_b)
        if el_a and el_b:
            score = _ELEMENT_AFFINITY.get((el_a, el_b), 0.5)
            components.append(score)
            if score >= 0.85:
                reasons.append(
                    f"{sign_a.title()} and {sign_b.title()} are compatible signs"
                )

        animal_a, animal_b = chinese_zodiac(a_date), chinese_zodiac(b_date)
        animal_score = _animal_affinity(animal_a, animal_b)
        components.append(animal_score)
        if animal_score >= 1.0:
            reasons.append(f"{animal_a.title()} and {animal_b.title()} are a trine pair")

    mbti_a = normalise_mbti(getattr(prefs_a, "mbti", None))
    mbti_b = normalise_mbti(getattr(prefs_b, "mbti", None))
    if mbti_a and mbti_b:
        score = _mbti_affinity(mbti_a, mbti_b)
        components.append(score)
        if score >= 0.7:
            reasons.append(f"{mbti_a} and {mbti_b} tend to get along")

    sched_a = (getattr(prefs_a, "sleep_schedule", None) or "").lower()
    sched_b = (getattr(prefs_b, "sleep_schedule", None) or "").lower()
    if sched_a in _SCHEDULES and sched_b in _SCHEDULES:
        score = _schedule_affinity(sched_a, sched_b)
        components.append(score)
        if score >= 1.0 and sched_a != "flexible":
            reasons.append(f"Both {sched_a} risers")

    # Realistic overlap — cheap to check and genuinely conversational.
    for field, label in (("industry", "industry"), ("city", "city")):
        val_a = (getattr(prefs_a, field, None) or "").strip().lower()
        val_b = (getattr(prefs_b, field, None) or "").strip().lower()
        if val_a and val_b:
            same = val_a == val_b
            components.append(1.0 if same else 0.5)
            if same:
                reasons.append(f"Same {label}: {val_a}")

    if not components:
        return 0.5, []

    return round(sum(components) / len(components), 4), reasons
