"""
Meetup plan generation — R3 (AI 社交/游玩方案生成).

What this produces for a confirmed pairing:
  * icebreakers — opening topics grounded in what the two people actually share
  * itinerary   — a time-boxed plan that fits the requested duration
  * mini_game   — one low-barrier interaction for the "we met but don't know what
                  to do" gap the PRD calls out

Two hard constraints shape the implementation:

1. **Tool role only.** Per the 2026 regulation cited in the PRD, the generator
   must present itself as arranging a real meeting between two people. It must
   not adopt a persona, roleplay, or produce emotional/romantic companionship
   content. The system prompt says so explicitly, and the fallback templates
   contain no such content by construction.
2. **Always returns something.** A missing plan would break the PRD's core loop,
   so when AINative is unconfigured or fails, a deterministic scene-specific
   template is used instead. `source` records which path ran, so adoption metrics
   can distinguish LLM from template output.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.meetup_plan import MeetupPlan, PlanSource
from ..models.meetup_request import MeetupMatchStatus, MeetupRequestMatch, SceneType
from ..models.user import User
from .ainative_service import _is_configured, generate_plan_completion
from .preference_memory_service import PreferenceMemoryService

logger = logging.getLogger(__name__)


class MeetupPlanService:
    def __init__(self, db: Session):
        self.db = db
        self._pref_svc = PreferenceMemoryService(db)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_or_create(self, user: User, match_id: UUID) -> MeetupPlan:
        """Return the plan for a confirmed match, generating it on first access."""
        from .meetup_request_service import MeetupRequestService  # noqa: PLC0415

        req_svc = MeetupRequestService(self.db)
        match = req_svc.get_match(user, match_id)

        if match.status != MeetupMatchStatus.CONFIRMED:
            raise HTTPException(
                400, "A plan is generated once both sides have confirmed."
            )

        existing = (
            self.db.query(MeetupPlan).filter(MeetupPlan.match_id == match.id).first()
        )
        if existing:
            return existing

        return self._generate(user, match)

    def mark_adopted(self, user: User, match_id: UUID) -> MeetupPlan:
        """Record that the pair intends to use the plan (PRD adoption metric)."""
        from .meetup_request_service import MeetupRequestService  # noqa: PLC0415

        MeetupRequestService(self.db).get_match(user, match_id)
        plan = (
            self.db.query(MeetupPlan).filter(MeetupPlan.match_id == match_id).first()
        )
        if not plan:
            raise HTTPException(404, "No plan for this match yet")

        plan.adopted = True
        plan.adopted_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(plan)
        return plan

    def regenerate(self, user: User, match_id: UUID) -> MeetupPlan:
        """Discard and rebuild the plan — used when the pair wants another option."""
        from .meetup_request_service import MeetupRequestService  # noqa: PLC0415

        match = MeetupRequestService(self.db).get_match(user, match_id)
        existing = (
            self.db.query(MeetupPlan).filter(MeetupPlan.match_id == match_id).first()
        )
        if existing:
            self.db.delete(existing)
            self.db.commit()
        return self._generate(user, match)

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def _generate(self, user: User, match: MeetupRequestMatch) -> MeetupPlan:
        from .meetup_request_service import MeetupRequestService  # noqa: PLC0415

        req_svc = MeetupRequestService(self.db)
        own_id = req_svc._side_of(match, user.id)
        own = req_svc.get_or_404(own_id)
        other_id = (
            match.counterpart_request_id
            if own_id == match.request_id
            else match.request_id
        )
        other = req_svc.get_or_404(other_id)

        shared = self._shared_interests(user.id, other.user_id)
        traits = self._combined_traits(user.id, other.user_id)

        content: Optional[dict] = None
        source = PlanSource.TEMPLATE

        if _is_configured():
            content = self._llm_plan(
                scene=own.scene,
                venue_name=own.venue_name,
                duration=own.duration_minutes,
                party_size=own.party_size,
                shared_interests=shared,
                traits=traits,
                note=own.note or other.note,
            )
            if content:
                source = PlanSource.LLM

        if content is None:
            content = _template_plan(
                scene=own.scene,
                venue_name=own.venue_name,
                duration=own.duration_minutes,
                shared_interests=shared,
            )

        plan = MeetupPlan(
            match_id=match.id,
            venue_name=own.venue_name,
            venue_type=own.venue_type.value,
            scene=own.scene.value,
            duration_minutes=own.duration_minutes,
            party_size=own.party_size,
            icebreakers=content["icebreakers"],
            itinerary=content["itinerary"],
            mini_game=content["mini_game"],
            shared_interests=shared,
            source=source,
        )
        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)
        return plan

    def _llm_plan(
        self,
        *,
        scene: SceneType,
        venue_name: str,
        duration: int,
        party_size: int,
        shared_interests: list[str],
        traits: list[str],
        note: Optional[str],
    ) -> Optional[dict]:
        """Ask the LLM for a plan. Returns None on any failure so the caller falls
        back to a template rather than surfacing an error."""
        interest_str = ", ".join(shared_interests[:6]) or "no stated overlap yet"
        trait_str = ", ".join(traits[:6]) or "not stated"
        note_str = f"\nOne of them wrote: {note}" if note else ""

        system = (
            "You are a scheduling tool for a real-world meetup app. Two strangers "
            "have agreed to meet in person and need a concrete plan for the time "
            "they have.\n"
            "Rules you must follow:\n"
            "- You are a tool, not a companion. Never adopt a persona, never "
            "roleplay, never write emotional, romantic or flirtatious content.\n"
            "- Suggest only public, low-cost activities that fit inside the venue "
            "and the stated duration.\n"
            "- Icebreakers must be neutral conversation topics, never personal, "
            "financial or intimate questions.\n"
            "- Respond with JSON only, no prose around it."
        )
        user_prompt = (
            f"Venue: {venue_name}\n"
            f"Activity type: {scene.value}\n"
            f"Time available: {duration} minutes\n"
            f"Group size: {party_size}\n"
            f"Shared interests: {interest_str}\n"
            f"Personality traits across the pair: {trait_str}{note_str}\n\n"
            "Return JSON with exactly these keys:\n"
            '{"icebreakers": ["3 short neutral opening topics"], '
            '"itinerary": [{"minute": 0, "title": "short label", '
            '"detail": "one sentence"}], '
            '"mini_game": {"name": "short name", "how_to_play": "two sentences, '
            'no props needed"}}\n'
            f"The itinerary must fit within {duration} minutes."
        )

        raw = generate_plan_completion(system=system, user_prompt=user_prompt)
        if not raw:
            return None

        try:
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start < 0 or end <= start:
                return None
            parsed = json.loads(raw[start:end])
            return _validate_plan(parsed, duration)
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            logger.warning("Plan JSON unusable, falling back to template: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Inputs
    # ------------------------------------------------------------------

    def _shared_interests(self, user_a: UUID, user_b: UUID) -> list[str]:
        prefs_a = self._pref_svc.get(user_a)
        prefs_b = self._pref_svc.get(user_b)
        if not prefs_a or not prefs_b:
            return []
        a = {i.lower() for i in (prefs_a.interests or [])}
        b = {i.lower() for i in (prefs_b.interests or [])}
        return sorted(a & b)

    def _combined_traits(self, user_a: UUID, user_b: UUID) -> list[str]:
        traits: list[str] = []
        for uid in (user_a, user_b):
            prefs = self._pref_svc.get(uid)
            if prefs and prefs.personality_traits:
                traits.extend(prefs.personality_traits)
        # De-duplicate while keeping order stable for reproducible prompts.
        seen: set[str] = set()
        return [t for t in traits if not (t in seen or seen.add(t))]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _validate_plan(parsed: dict, duration: int) -> Optional[dict]:
    """Coerce LLM output into the stored shape, or reject it.

    An LLM can return the right JSON keys with unusable values, so entries are
    filtered rather than trusted. Returning None sends the caller to the template.
    """
    icebreakers = [
        str(t).strip()
        for t in (parsed.get("icebreakers") or [])
        if isinstance(t, (str, int, float)) and str(t).strip()
    ][:4]

    itinerary: list[dict] = []
    for step in parsed.get("itinerary") or []:
        if not isinstance(step, dict):
            continue
        try:
            minute = int(step.get("minute", 0))
        except (TypeError, ValueError):
            continue
        title = str(step.get("title", "")).strip()
        if not title or minute < 0 or minute > duration:
            continue
        itinerary.append(
            {
                "minute": minute,
                "title": title[:80],
                "detail": str(step.get("detail", "")).strip()[:200],
            }
        )
    itinerary.sort(key=lambda s: s["minute"])
    itinerary = itinerary[:6]

    game_raw = parsed.get("mini_game")
    mini_game: dict = {}
    if isinstance(game_raw, dict):
        name = str(game_raw.get("name", "")).strip()
        how = str(game_raw.get("how_to_play", "")).strip()
        if name and how:
            mini_game = {"name": name[:60], "how_to_play": how[:300]}

    # A plan with no icebreakers and no itinerary is worse than the template.
    if not icebreakers or not itinerary:
        return None

    return {
        "icebreakers": icebreakers,
        "itinerary": itinerary,
        "mini_game": mini_game,
    }


# ---------------------------------------------------------------------------
# Deterministic fallback
# ---------------------------------------------------------------------------

_SCENE_PLANS: dict[SceneType, dict] = {
    SceneType.DINING: {
        "icebreakers": [
            "Which places here have you already tried?",
            "Are you the order-the-usual type or the try-something-new type?",
            "What's the best thing you've eaten near here?",
        ],
        "steps": [
            ("Pick a spot together", "Each name two options, then take whichever has the shorter queue."),
            ("Order and settle in", "Order separately so nobody has to negotiate the bill later."),
            ("Eat and talk", "Trade one recommendation each for somewhere else in this mall."),
            ("Wrap up", "Split the bill on the spot and decide independently whether to swap contacts."),
        ],
        "game": {
            "name": "Two truths, one menu",
            "how_to_play": (
                "Each person names three dishes they claim to have eaten here, one of "
                "which is invented. The other guesses the fake one. Loser picks the "
                "dessert."
            ),
        },
    },
    SceneType.ENTERTAINMENT: {
        "icebreakers": [
            "What did you play most as a kid?",
            "Are you competitive or here to mess around?",
            "Anything in this place you've been curious about but never tried?",
        ],
        "steps": [
            ("Walk one lap", "Circle the floor once and each point out one thing you want to try."),
            ("Start easy", "Begin with whatever needs no explanation — nothing with a rulebook."),
            ("Take turns choosing", "Alternate who picks the next activity so neither of you steers everything."),
            ("Wrap up", "End on whichever one you both enjoyed most."),
        ],
        "game": {
            "name": "Alternating picks",
            "how_to_play": (
                "Take turns choosing the next machine or game, and the person who "
                "didn't choose goes first. No stakes, no keeping score."
            ),
        },
    },
    SceneType.SHOPPING: {
        "icebreakers": [
            "What's actually on your list today?",
            "Do you plan your shop or wander?",
            "Anything here you always end up buying?",
        ],
        "steps": [
            ("Compare lists", "Say what you each need and spot anything worth buying in bulk together."),
            ("Shop the shared aisles", "Do the overlapping sections together, split up for the rest."),
            ("Regroup and split", "Meet at the checkout, split anything shared down the middle."),
            ("Wrap up", "Settle up before you leave so nothing is owed afterwards."),
        ],
        "game": {
            "name": "Price guess",
            "how_to_play": (
                "Before scanning, each guess the total of your own basket. Closest "
                "guess picks where to grab a drink afterwards, if you both want to."
            ),
        },
    },
}


def _template_plan(
    *,
    scene: SceneType,
    venue_name: str,
    duration: int,
    shared_interests: list[str],
) -> dict:
    """Deterministic plan used whenever the LLM is unavailable or unusable."""
    base = _SCENE_PLANS.get(scene, _SCENE_PLANS[SceneType.DINING])

    icebreakers = list(base["icebreakers"])
    if shared_interests:
        # Lead with the actual overlap — it's the strongest opener available.
        icebreakers.insert(
            0, f"You both listed {shared_interests[0]} — how did you get into it?"
        )
    icebreakers = icebreakers[:4]

    steps = base["steps"]
    # Spread the steps evenly across the available time.
    slot = max(5, duration // max(1, len(steps)))
    itinerary = [
        {"minute": i * slot, "title": title, "detail": detail}
        for i, (title, detail) in enumerate(steps)
    ]

    return {
        "icebreakers": icebreakers,
        "itinerary": itinerary,
        "mini_game": dict(base["game"]),
    }
