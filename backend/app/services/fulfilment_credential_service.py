"""
Fulfilment credential service — R8 (SBT 铸造), R9 (信用分), R11 (匹配特征).

Design decisions worth knowing:

* A credential is minted **per holder**, not per meetup pair, and its metadata
  never references the counterparty (PRD R8: 不含对方身份信息).
* ``credit_score`` is only *exposed* once the user has ``_CREDIT_MIN_HISTORY``
  fulfilments (PRD R9); before that the API reports the raw counts and states
  that the score is not yet available, rather than showing a meaningless 50.
* The score is explicitly documented as a fulfilment-history signal, never a
  personal-safety guarantee (PRD §8 / 待确认问题 5).
* Minting degrades gracefully: when no SBT contract address or signer key is
  configured, the DB row stays ``pending`` and the API keeps working.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.attestation import AttestationStatus, MeetupAttestation
from ..models.fulfilment_credential import (
    CreditProfile, CredentialMintStatus, CredentialOutcome, FulfilmentCredential,
)
from ..models.meetup_request import MeetupRequest
from ..models.user import User
from .monad_service import MonadService

logger = logging.getLogger(__name__)

# PRD R9: 完成 ≥5 次履约后可查看信用分
_CREDIT_MIN_HISTORY = 5

_SCORE_BASE = 50.0
_KEPT_WEIGHT = 8.0
_NO_SHOW_WEIGHT = 15.0
_DISPUTED_WEIGHT = 3.0

_DISCLAIMER = (
    "Credit reflects past meetup follow-through only. "
    "It is not a personal-safety guarantee."
)


def _time_bucket(dt: datetime) -> str:
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


class FulfilmentCredentialService:
    def __init__(self, db: Session):
        self.db = db
        self._chain = MonadService()

    # ------------------------------------------------------------------
    # R8 — credential issuance
    # ------------------------------------------------------------------

    def issue_for_attestation(
        self,
        attestation_id: UUID,
        outcome: CredentialOutcome = CredentialOutcome.KEPT,
    ) -> list[FulfilmentCredential]:
        """Issue one credential per confirmed party of an attestation."""
        attestation = (
            self.db.query(MeetupAttestation)
            .filter(MeetupAttestation.id == attestation_id)
            .first()
        )
        if not attestation:
            raise HTTPException(404, "Attestation not found")
        if attestation.status != AttestationStatus.CONFIRMED:
            raise HTTPException(400, "Attestation is not confirmed")

        holders = [
            uid
            for uid in (
                attestation.initiator_user_id,
                attestation.counterparty_user_id,
            )
            if uid is not None
        ]
        issued: list[FulfilmentCredential] = []
        for holder_id in holders:
            issued.append(
                self.issue(
                    holder_id=holder_id,
                    outcome=outcome,
                    attestation_id=attestation.id,
                )
            )
        return issued

    def issue(
        self,
        holder_id: UUID,
        outcome: CredentialOutcome,
        attestation_id: Optional[UUID] = None,
        meetup_request_id: Optional[UUID] = None,
    ) -> FulfilmentCredential:
        existing = None
        if attestation_id:
            existing = (
                self.db.query(FulfilmentCredential)
                .filter(
                    FulfilmentCredential.attestation_id == attestation_id,
                    FulfilmentCredential.holder_id == holder_id,
                )
                .first()
            )
        if existing:
            return existing

        request = self._resolve_request(holder_id, meetup_request_id)
        occurred_at = datetime.utcnow()

        credential = FulfilmentCredential(
            holder_id=holder_id,
            attestation_id=attestation_id,
            meetup_request_id=request.id if request else meetup_request_id,
            venue_type=request.venue_type.value if request else None,
            scene=request.scene.value if request else None,
            occurred_at=occurred_at,
            duration_minutes=request.duration_minutes if request else None,
            outcome=outcome,
            soulbound=True,
            mint_status=CredentialMintStatus.PENDING,
        )
        # Metadata is the exact payload anchored on-chain — no counterparty.
        credential.metadata_json = {
            "type": "fulfilment_credential",
            "soulbound": True,
            "venue_type": credential.venue_type,
            "scene": credential.scene,
            "occurred_at": occurred_at.isoformat(),
            "duration_minutes": credential.duration_minutes,
            "outcome": outcome.value,
            "disclaimer": _DISCLAIMER,
        }

        self.db.add(credential)
        self.db.commit()
        self.db.refresh(credential)

        self._anchor(credential)
        self._recompute_profile(holder_id)
        return credential

    def list_for_user(
        self, user_id: UUID, limit: int = 20, offset: int = 0
    ) -> Tuple[list[FulfilmentCredential], int]:
        query = self.db.query(FulfilmentCredential).filter(
            FulfilmentCredential.holder_id == user_id
        )
        total = query.count()
        items = (
            query.order_by(FulfilmentCredential.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return items, total

    # ------------------------------------------------------------------
    # R9 — credit score
    # ------------------------------------------------------------------

    def get_credit(self, user_id: UUID) -> dict:
        profile = self._recompute_profile(user_id)
        unlocked = profile.fulfilled_count >= _CREDIT_MIN_HISTORY
        return {
            "user_id": str(user_id),
            "fulfilled_count": profile.fulfilled_count,
            "no_show_count": profile.no_show_count,
            "disputed_count": profile.disputed_count,
            "score_available": unlocked,
            "credit_score": profile.credit_score if unlocked else None,
            "breakdown": profile.score_breakdown if unlocked else None,
            "required_fulfilments": _CREDIT_MIN_HISTORY,
            "disclaimer": _DISCLAIMER,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _resolve_request(
        self, holder_id: UUID, meetup_request_id: Optional[UUID]
    ) -> Optional[MeetupRequest]:
        if meetup_request_id:
            return (
                self.db.query(MeetupRequest)
                .filter(MeetupRequest.id == meetup_request_id)
                .first()
            )
        # Fall back to the holder's most recent request so venue/scene metadata
        # is populated even when the caller doesn't pass the id explicitly.
        return (
            self.db.query(MeetupRequest)
            .filter(MeetupRequest.user_id == holder_id)
            .order_by(MeetupRequest.created_at.desc())
            .first()
        )

    def _anchor(self, credential: FulfilmentCredential) -> None:
        """Best-effort on-chain record; leaves status pending when unconfigured."""
        holder = self.db.query(User).filter(User.id == credential.holder_id).first()
        tx_hash = self._chain.submit_credential_record(
            credential_id=str(credential.id),
            holder_wallet=holder.wallet_address if holder else None,
            metadata=credential.metadata_json,
        )
        if tx_hash:
            credential.tx_hash = tx_hash
            credential.mint_status = CredentialMintStatus.MINTED
            credential.minted_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(credential)

    def _recompute_profile(self, user_id: UUID) -> CreditProfile:
        credentials = (
            self.db.query(FulfilmentCredential)
            .filter(FulfilmentCredential.holder_id == user_id)
            .all()
        )

        kept = sum(1 for c in credentials if c.outcome == CredentialOutcome.KEPT)
        no_show = sum(1 for c in credentials if c.outcome == CredentialOutcome.NO_SHOW)
        disputed = sum(
            1 for c in credentials if c.outcome == CredentialOutcome.DISPUTED
        )

        scene_pref: dict = {}
        slot_pref: dict = {}
        for cred in credentials:
            if cred.outcome != CredentialOutcome.KEPT:
                continue
            if cred.scene:
                scene_pref[cred.scene] = scene_pref.get(cred.scene, 0) + 1
            if cred.occurred_at:
                bucket = _time_bucket(cred.occurred_at)
                slot_pref[bucket] = slot_pref.get(bucket, 0) + 1

        raw = (
            _SCORE_BASE
            + kept * _KEPT_WEIGHT
            - no_show * _NO_SHOW_WEIGHT
            - disputed * _DISPUTED_WEIGHT
        )
        score = round(max(0.0, min(100.0, raw)), 2)

        profile = (
            self.db.query(CreditProfile)
            .filter(CreditProfile.user_id == user_id)
            .first()
        )
        if not profile:
            profile = CreditProfile(user_id=user_id)
            self.db.add(profile)

        profile.fulfilled_count = kept
        profile.no_show_count = no_show
        profile.disputed_count = disputed
        profile.credit_score = score
        profile.score_breakdown = {
            "base": _SCORE_BASE,
            "kept_bonus": round(kept * _KEPT_WEIGHT, 2),
            "no_show_penalty": round(no_show * _NO_SHOW_WEIGHT, 2),
            "disputed_penalty": round(disputed * _DISPUTED_WEIGHT, 2),
        }
        profile.scene_preference = scene_pref
        profile.time_slot_preference = slot_pref
        self.db.commit()
        self.db.refresh(profile)
        return profile
