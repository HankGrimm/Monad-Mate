"""
Meetup request service — R1 (发起-匹配-确认), R10 (安全偏好硬过滤),
R11 (历史履约特征参与排序).

Matching rules, in order of strictness:

1. **Hard constraints** — same ``venue_key``, overlapping time window, same
   scene, both requests still ``OPEN``, not blocked either way, and both sides'
   R10 preferences satisfied *mutually*.  A candidate failing any of these is
   never returned, not merely down-ranked.
2. **Ranking** — preference similarity, credit/fulfilment history, scene &
   time-slot habit overlap (R11), and window overlap length.

The service deliberately returns an empty list rather than padding results
with weak candidates (PRD §7 step 2: 无匹配时明确提示，不做虚假凑数).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models.block import Block
from ..models.fulfilment_credential import CreditProfile
from ..models.meetup_request import (
    GenderPreference, MeetupMatchStatus, MeetupRequest, MeetupRequestMatch,
    MeetupRequestStatus,
)
from ..models.persona import Persona
from ..models.reputation import ReputationScore
from ..models.user import Gender, User, VerificationLevel
from ..schemas.meetup_request import MeetupRequestCreate
from .preference_memory_service import PreferenceMemoryService

# Ranking weights (sum to 1.0)
_W_PREFERENCE = 0.30
_W_CREDIT = 0.25
_W_HISTORY = 0.20   # R11: scene + time-slot habit overlap
_W_WINDOW = 0.15
_W_SAFETY = 0.10

# R11 only kicks in once the user has enough history to be meaningful.
_HISTORY_MIN_FULFILMENTS = 3

_VERIFIED_LEVELS = (
    VerificationLevel.PHONE,
    VerificationLevel.ID,
    VerificationLevel.FULL,
)


def _time_bucket(dt: datetime) -> str:
    """Coarse time-of-day bucket used for R11 habit matching."""
    hour = dt.hour
    if hour < 11:
        return "morning"
    if hour < 14:
        return "noon"
    if hour < 18:
        return "afternoon"
    if hour < 22:
        return "evening"
    return "late"


def _is_verified(user: User) -> bool:
    return user.verification_level in _VERIFIED_LEVELS


class MeetupRequestService:
    def __init__(self, db: Session):
        self.db = db
        self._pref_svc = PreferenceMemoryService(db)

    # ------------------------------------------------------------------
    # R1 — create / read / cancel
    # ------------------------------------------------------------------

    def create(self, user: User, payload: MeetupRequestCreate) -> MeetupRequest:
        # PRD R4: 未完成实名认证不可发起/接受匹配
        self._require_verified(user)
        # PRD R5: 被举报方在复核期内不可发起新匹配
        self._require_not_under_review(user)
        self._expire_stale()

        # One open request per user at a time keeps the matching graph simple
        # and prevents a user from flooding a venue with duplicate intents.
        existing = (
            self.db.query(MeetupRequest)
            .filter(
                MeetupRequest.user_id == user.id,
                MeetupRequest.status.in_(
                    [MeetupRequestStatus.OPEN, MeetupRequestStatus.MATCHED]
                ),
            )
            .first()
        )
        if existing:
            raise HTTPException(
                409, "You already have an active meetup request; cancel it first."
            )

        if payload.gender_preference == GenderPreference.SAME_ONLY and (
            user.gender in (Gender.UNDISCLOSED, None)
        ):
            raise HTTPException(
                400,
                "Set your gender before using the same-gender-only preference.",
            )

        start = payload.window_start or datetime.utcnow()
        request = MeetupRequest(
            user_id=user.id,
            persona_id=payload.persona_id,
            venue_type=payload.venue_type,
            venue_name=payload.venue_name,
            venue_key=payload.venue_key.strip().lower(),
            latitude=payload.latitude,
            longitude=payload.longitude,
            scene=payload.scene,
            note=payload.note,
            party_size=payload.party_size,
            duration_minutes=payload.duration_minutes,
            window_start=start,
            window_end=start + timedelta(minutes=payload.duration_minutes),
            gender_preference=payload.gender_preference,
            require_verified=payload.require_verified,
            min_reputation_score=payload.min_reputation_score,
            status=MeetupRequestStatus.OPEN,
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        return request

    def get_or_404(self, request_id: UUID) -> MeetupRequest:
        request = (
            self.db.query(MeetupRequest)
            .filter(MeetupRequest.id == request_id)
            .first()
        )
        if not request:
            raise HTTPException(404, "Meetup request not found")
        return request

    def list_mine(self, user: User) -> List[MeetupRequest]:
        self._expire_stale()
        return (
            self.db.query(MeetupRequest)
            .filter(MeetupRequest.user_id == user.id)
            .order_by(MeetupRequest.created_at.desc())
            .all()
        )

    def cancel(self, user: User, request_id: UUID) -> MeetupRequest:
        request = self.get_or_404(request_id)
        if request.user_id != user.id:
            raise HTTPException(403, "Not your request")
        if request.status in (
            MeetupRequestStatus.FULFILLED,
            MeetupRequestStatus.CONFIRMED,
        ):
            raise HTTPException(400, "Confirmed or fulfilled requests cannot be cancelled")
        request.status = MeetupRequestStatus.CANCELLED
        self.db.commit()
        self.db.refresh(request)
        return request

    # ------------------------------------------------------------------
    # R1 + R10 + R11 — candidate matching
    # ------------------------------------------------------------------

    def find_candidates(
        self, user: User, request_id: UUID, limit: int = 10
    ) -> List[dict]:
        request = self.get_or_404(request_id)
        if request.user_id != user.id:
            raise HTTPException(403, "Not your request")
        if request.status not in (
            MeetupRequestStatus.OPEN,
            MeetupRequestStatus.MATCHED,
        ):
            raise HTTPException(400, f"Request is {request.status.value}")

        self._expire_stale()

        # Hard constraint pass at the query layer: same venue, same scene,
        # overlapping window, still open.
        rows = (
            self.db.query(MeetupRequest)
            .filter(
                MeetupRequest.id != request.id,
                MeetupRequest.user_id != user.id,
                MeetupRequest.venue_key == request.venue_key,
                MeetupRequest.scene == request.scene,
                MeetupRequest.status == MeetupRequestStatus.OPEN,
                MeetupRequest.window_start < request.window_end,
                MeetupRequest.window_end > request.window_start,
            )
            .limit(200)
            .all()
        )
        if not rows:
            return []

        blocked = self._blocked_user_ids(user.id)
        results: List[dict] = []

        for candidate in rows:
            if candidate.user_id in blocked:
                continue
            other = self.db.query(User).filter(User.id == candidate.user_id).first()
            if not other or not other.is_active:
                continue
            if not self._safety_preferences_ok(request, user, candidate, other):
                continue

            score, breakdown, reasons = self._score(request, user, candidate, other)
            profile = self._credit_profile(other.id)
            persona = (
                self.db.query(Persona).filter(Persona.id == candidate.persona_id).first()
                if candidate.persona_id
                else None
            )
            results.append({
                "counterpart_request_id": candidate.id,
                "counterpart_user_id": other.id,
                "display_name": persona.display_name if persona else None,
                "scene": candidate.scene,
                "venue_name": candidate.venue_name,
                "score": score,
                "reasons": reasons,
                "breakdown": breakdown,
                "credit_score": profile.credit_score if profile else None,
                "fulfilled_count": profile.fulfilled_count if profile else 0,
                "verified": _is_verified(other),
            })

        results.sort(key=lambda r: r["score"], reverse=True)
        return results[:limit]

    # ------------------------------------------------------------------
    # R1 — two-sided confirmation handshake
    # ------------------------------------------------------------------

    def propose(
        self, user: User, request_id: UUID, counterpart_request_id: UUID
    ) -> MeetupRequestMatch:
        """Create (or reuse) a pairing and record the requester's acceptance."""
        self._require_verified(user)
        self._require_not_under_review(user)
        request = self.get_or_404(request_id)
        if request.user_id != user.id:
            raise HTTPException(403, "Not your request")

        counterpart = self.get_or_404(counterpart_request_id)
        other = self.db.query(User).filter(User.id == counterpart.user_id).first()
        if not other:
            raise HTTPException(404, "Counterpart user not found")

        if counterpart.status != MeetupRequestStatus.OPEN:
            raise HTTPException(400, "Counterpart request is no longer open")
        if counterpart.venue_key != request.venue_key:
            raise HTTPException(400, "Candidate is not at the same venue")
        if counterpart.user_id in self._blocked_user_ids(user.id):
            raise HTTPException(400, "Candidate is blocked")
        if not self._safety_preferences_ok(request, user, counterpart, other):
            raise HTTPException(400, "Candidate does not satisfy safety preferences")

        match = (
            self.db.query(MeetupRequestMatch)
            .filter(
                MeetupRequestMatch.status.in_(
                    [MeetupMatchStatus.PENDING, MeetupMatchStatus.ACCEPTED]
                ),
                or_(
                    (MeetupRequestMatch.request_id == request.id)
                    & (MeetupRequestMatch.counterpart_request_id == counterpart.id),
                    (MeetupRequestMatch.request_id == counterpart.id)
                    & (MeetupRequestMatch.counterpart_request_id == request.id),
                ),
            )
            .first()
        )

        if match is None:
            score, breakdown, reasons = self._score(request, user, counterpart, other)
            match = MeetupRequestMatch(
                request_id=request.id,
                counterpart_request_id=counterpart.id,
                score=score,
                score_breakdown=breakdown,
                reasons=reasons,
                status=MeetupMatchStatus.PENDING,
            )
            self.db.add(match)
            self.db.flush()

        self._record_acceptance(match, request.id)
        self._settle(match)
        self.db.commit()
        self.db.refresh(match)
        return match

    def respond(
        self, user: User, match_id: UUID, accept: bool
    ) -> MeetupRequestMatch:
        self._require_verified(user)
        match = (
            self.db.query(MeetupRequestMatch)
            .filter(MeetupRequestMatch.id == match_id)
            .first()
        )
        if not match:
            raise HTTPException(404, "Match not found")
        if match.status in (MeetupMatchStatus.DECLINED, MeetupMatchStatus.EXPIRED):
            raise HTTPException(400, f"Match is {match.status.value}")

        side = self._side_of(match, user.id)
        if side is None:
            raise HTTPException(403, "You are not part of this match")

        # Declining is always allowed — a user under review must still be able to
        # back out of a pairing. Only acceptance is gated.
        if accept:
            self._require_not_under_review(user)


        if not accept:
            # PRD §7 step 4: 任一方拒绝则流程终止，不影响信用
            match.status = MeetupMatchStatus.DECLINED
            for req_id in (match.request_id, match.counterpart_request_id):
                req = self.db.query(MeetupRequest).filter(
                    MeetupRequest.id == req_id
                ).first()
                if req and req.status == MeetupRequestStatus.MATCHED:
                    req.status = MeetupRequestStatus.OPEN
            self.db.commit()
            self.db.refresh(match)
            return match

        self._record_acceptance(match, side)
        self._settle(match)
        self.db.commit()
        self.db.refresh(match)
        return match

    def list_matches(self, user: User, request_id: UUID) -> List[MeetupRequestMatch]:
        request = self.get_or_404(request_id)
        if request.user_id != user.id:
            raise HTTPException(403, "Not your request")
        return (
            self.db.query(MeetupRequestMatch)
            .filter(
                or_(
                    MeetupRequestMatch.request_id == request.id,
                    MeetupRequestMatch.counterpart_request_id == request.id,
                )
            )
            .order_by(MeetupRequestMatch.created_at.desc())
            .all()
        )

    def get_match(self, user: User, match_id: UUID) -> MeetupRequestMatch:
        """Fetch one pairing, but only for a participant."""
        match = (
            self.db.query(MeetupRequestMatch)
            .filter(MeetupRequestMatch.id == match_id)
            .first()
        )
        if not match:
            raise HTTPException(404, "Match not found")
        if self._side_of(match, user.id) is None:
            raise HTTPException(403, "You are not part of this match")
        return match

    def match_detail(self, user: User, match_id: UUID) -> dict:
        """Participant-facing view of a pairing.

        Exposes only what the confirmation screen needs: the venue, scene and
        window (identical for both sides), the counterpart's display name,
        verification state and fulfilment count — never their user id, wallet
        address or contact details.
        """
        match = self.get_match(user, match_id)
        own_request_id = self._side_of(match, user.id)

        own = self.get_or_404(own_request_id)
        other_id = (
            match.counterpart_request_id
            if own_request_id == match.request_id
            else match.request_id
        )
        other = self.get_or_404(other_id)
        other_user = self.db.query(User).filter(User.id == other.user_id).first()

        persona = (
            self.db.query(Persona).filter(Persona.id == other.persona_id).first()
            if other.persona_id
            else None
        )
        profile = self._credit_profile(other.user_id) if other_user else None

        you_accepted = (
            match.requester_accepted
            if own_request_id == match.request_id
            else match.counterpart_accepted
        )
        they_accepted = (
            match.counterpart_accepted
            if own_request_id == match.request_id
            else match.requester_accepted
        )

        return {
            "id": str(match.id),
            "status": match.status.value,
            "score": match.score,
            "reasons": match.reasons or [],
            "you_accepted": you_accepted,
            "they_accepted": they_accepted,
            "confirmed_at": match.confirmed_at,
            "own_request_id": str(own.id),
            "venue_type": own.venue_type.value,
            "venue_name": own.venue_name,
            "scene": own.scene.value,
            "window_start": own.window_start,
            "window_end": own.window_end,
            "party_size": own.party_size,
            "counterpart": {
                "display_name": persona.display_name if persona else None,
                "verified": _is_verified(other_user) if other_user else False,
                "fulfilled_count": profile.fulfilled_count if profile else 0,
                "credit_score": (
                    profile.credit_score
                    if profile and profile.fulfilled_count >= 5
                    else None
                ),
            },
        }


    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _require_verified(self, user: User) -> None:
        if not _is_verified(user):
            raise HTTPException(
                403,
                "Identity verification required before creating or accepting a meetup.",
            )

    def _require_not_under_review(self, user: User) -> None:
        """R5: a reported user cannot start or accept a meetup while under review.

        Deliberately blocks *both* directions of the flow, since letting a
        reported user accept invitations would leave the same exposure open.
        The bar is unresolved reports at or above the repeat-offender threshold,
        so a single unverified accusation cannot lock someone out — that would
        turn reporting into a denial-of-service tool.
        """
        from .report_service import ReportService  # noqa: PLC0415

        if ReportService(self.db).is_repeat_offender(user.id):
            raise HTTPException(
                403,
                "Your account is under safety review and cannot start or accept "
                "meetups until it is resolved.",
            )


    def _side_of(self, match: MeetupRequestMatch, user_id: UUID) -> Optional[UUID]:
        """Return which request id in *match* belongs to *user_id*, else None."""
        for req_id in (match.request_id, match.counterpart_request_id):
            req = self.db.query(MeetupRequest).filter(
                MeetupRequest.id == req_id
            ).first()
            if req and req.user_id == user_id:
                return req_id
        return None

    def _record_acceptance(self, match: MeetupRequestMatch, request_id: UUID) -> None:
        if request_id == match.request_id:
            match.requester_accepted = True
        else:
            match.counterpart_accepted = True

    def _settle(self, match: MeetupRequestMatch) -> None:
        """Advance match + both requests based on current acceptance flags."""
        requests = [
            self.db.query(MeetupRequest).filter(MeetupRequest.id == rid).first()
            for rid in (match.request_id, match.counterpart_request_id)
        ]
        if match.requester_accepted and match.counterpart_accepted:
            match.status = MeetupMatchStatus.CONFIRMED
            match.confirmed_at = datetime.utcnow()
            for req in requests:
                if req:
                    req.status = MeetupRequestStatus.CONFIRMED
        else:
            match.status = MeetupMatchStatus.ACCEPTED
            for req in requests:
                if req and req.status == MeetupRequestStatus.OPEN:
                    req.status = MeetupRequestStatus.MATCHED

    def _blocked_user_ids(self, user_id: UUID) -> set:
        """Bidirectional: users I blocked *and* users who blocked me."""
        rows = (
            self.db.query(Block.blocker_id, Block.blocked_id)
            .filter(or_(Block.blocker_id == user_id, Block.blocked_id == user_id))
            .all()
        )
        ids = set()
        for blocker_id, blocked_id in rows:
            ids.add(blocked_id if blocker_id == user_id else blocker_id)
        return ids

    def _safety_preferences_ok(
        self,
        request: MeetupRequest,
        user: User,
        candidate: MeetupRequest,
        other: User,
    ) -> bool:
        """R10 — preferences are hard filters and must hold in *both* directions."""
        pairs = ((request, user, other), (candidate, other, user))
        for req, owner, counterpart in pairs:
            if req.gender_preference == GenderPreference.SAME_ONLY:
                if owner.gender in (Gender.UNDISCLOSED, None):
                    return False
                if counterpart.gender != owner.gender:
                    return False
            if req.require_verified and not _is_verified(counterpart):
                return False
            if req.min_reputation_score is not None:
                rep = (
                    self.db.query(ReputationScore)
                    .filter(ReputationScore.user_id == counterpart.id)
                    .first()
                )
                score = rep.composite_score if rep else 50.0
                if score < req.min_reputation_score:
                    return False
        return True

    def _credit_profile(self, user_id: UUID) -> Optional[CreditProfile]:
        return (
            self.db.query(CreditProfile)
            .filter(CreditProfile.user_id == user_id)
            .first()
        )

    def _score(
        self,
        request: MeetupRequest,
        user: User,
        candidate: MeetupRequest,
        other: User,
    ) -> Tuple[float, Dict[str, Any], List[str]]:
        reasons: List[str] = [
            f"Both at {request.venue_name} right now",
            f"Same intent: {request.scene.value}",
        ]

        # --- Preference similarity (embedding cosine) ---
        pref_sim = 0.0
        prefs_a = self._pref_svc.get(user.id)
        prefs_b = self._pref_svc.get(other.id)
        if prefs_a and prefs_b and prefs_a.embedding_vector and prefs_b.embedding_vector:
            pref_sim = PreferenceMemoryService.cosine_similarity(
                prefs_a.embedding_vector, prefs_b.embedding_vector
            )
            shared = sorted(
                set(i.lower() for i in (prefs_a.interests or []))
                & set(i.lower() for i in (prefs_b.interests or []))
            )
            if shared:
                reasons.append("Shared interests: " + ", ".join(shared[:3]))
        else:
            pref_sim = 0.5  # unknown → neutral, don't punish new users

        # --- Credit / fulfilment history (R9) ---
        profile_b = self._credit_profile(other.id)
        if profile_b:
            credit = min(1.0, max(0.0, profile_b.credit_score / 100.0))
            if profile_b.fulfilled_count > 0:
                reasons.append(f"{profile_b.fulfilled_count} past meetups kept")
        else:
            credit = 0.5

        # --- R11: habit overlap, only once both sides have history ---
        history = 0.5
        profile_a = self._credit_profile(user.id)
        if (
            profile_a
            and profile_b
            and profile_a.fulfilled_count >= _HISTORY_MIN_FULFILMENTS
            and profile_b.fulfilled_count >= _HISTORY_MIN_FULFILMENTS
        ):
            history = self._habit_overlap(profile_a, profile_b, request)
            if history > 0.6:
                reasons.append("Similar scene and time-slot habits")

        # --- Window overlap ratio ---
        overlap_start = max(request.window_start, candidate.window_start)
        overlap_end = min(request.window_end, candidate.window_end)
        overlap_min = max(0.0, (overlap_end - overlap_start).total_seconds() / 60.0)
        window = min(1.0, overlap_min / max(1, request.duration_minutes))

        # --- Safety signal ---
        rep_b = (
            self.db.query(ReputationScore)
            .filter(ReputationScore.user_id == other.id)
            .first()
        )
        if rep_b:
            safety = max(
                0.0,
                min(1.0, rep_b.safety_score / 100.0) - min(1.0, rep_b.no_show_rate) * 0.5,
            )
        else:
            safety = 0.5
        if _is_verified(other):
            reasons.append("Identity verified")

        total = round(
            pref_sim * _W_PREFERENCE
            + credit * _W_CREDIT
            + history * _W_HISTORY
            + window * _W_WINDOW
            + safety * _W_SAFETY,
            4,
        )
        breakdown = {
            "preference_similarity": round(pref_sim, 4),
            "credit_score": round(credit, 4),
            "history_affinity": round(history, 4),
            "window_overlap": round(window, 4),
            "safety_score": round(safety, 4),
        }
        return total, breakdown, reasons

    def _habit_overlap(
        self, a: CreditProfile, b: CreditProfile, request: MeetupRequest
    ) -> float:
        """Cosine-like overlap of scene and time-slot frequency maps (R11)."""
        scene_overlap = self._map_overlap(a.scene_preference, b.scene_preference)
        slot_overlap = self._map_overlap(
            a.time_slot_preference, b.time_slot_preference
        )
        # Bonus when both have actually done this scene before.
        scene_key = request.scene.value
        both_did_scene = (
            (a.scene_preference or {}).get(scene_key, 0) > 0
            and (b.scene_preference or {}).get(scene_key, 0) > 0
        )
        base = 0.5 * scene_overlap + 0.5 * slot_overlap
        return min(1.0, base + (0.2 if both_did_scene else 0.0))

    @staticmethod
    def _map_overlap(a: Optional[dict], b: Optional[dict]) -> float:
        a = a or {}
        b = b or {}
        if not a or not b:
            return 0.0
        keys = set(a) | set(b)
        dot = sum(float(a.get(k, 0)) * float(b.get(k, 0)) for k in keys)
        mag_a = sum(float(v) ** 2 for v in a.values()) ** 0.5
        mag_b = sum(float(v) ** 2 for v in b.values()) ** 0.5
        if mag_a == 0 or mag_b == 0:
            return 0.0
        return max(0.0, min(1.0, dot / (mag_a * mag_b)))

    def _expire_stale(self) -> None:
        """Close out requests whose window has passed."""
        now = datetime.utcnow()
        stale = (
            self.db.query(MeetupRequest)
            .filter(
                MeetupRequest.window_end < now,
                MeetupRequest.status.in_(
                    [MeetupRequestStatus.OPEN, MeetupRequestStatus.MATCHED]
                ),
            )
            .all()
        )
        if not stale:
            return
        for req in stale:
            req.status = MeetupRequestStatus.EXPIRED
        self.db.commit()
