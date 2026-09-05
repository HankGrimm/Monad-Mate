from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from datetime import datetime
import uuid

from fastapi import HTTPException

from ..models.stake import Stake, StakeStatus, StakeType
from ..models.user import User
from ..schemas.stake import StakeCreate
from ..core.config import settings
from ..core.errors import StakeNotFoundError, InsufficientStakeError
from .hcs_anchoring_service import HCSAnchoringService
from .monad_service import MonadService, deposit_address


class StakeService:
    def __init__(self, db: Session):
        self.db = db

    MIN_AMOUNTS = {
        StakeType.DM: lambda: settings.MIN_STAKE_DM_MON,
        StakeType.JOIN_ROOM: lambda: settings.MIN_STAKE_ROOM_MON,
        StakeType.REQUEST_MEETUP: lambda: settings.MIN_STAKE_MEETUP_MON,
        StakeType.CONFIRM_MEETUP: lambda: settings.MIN_STAKE_MEETUP_MON,
        StakeType.UNLOCK_PHOTO: lambda: 0.5,
    }

    def create(self, user: User, payload: StakeCreate) -> Stake:
        min_amt = self.MIN_AMOUNTS.get(payload.stake_type, lambda: 0.0)()
        if payload.amount_mon < min_amt:
            raise InsufficientStakeError(min_amt, payload.amount_mon)

        # R6: a meetup deposit must name the meetup it backs, otherwise there is
        # nothing to key the automatic refund off when both sides check in.
        if payload.stake_type == StakeType.CONFIRM_MEETUP and not payload.meetup_match_id:
            raise HTTPException(
                400, "meetup_match_id is required for a meetup commitment deposit"
            )

        onchain_verified = False
        deposit_target = deposit_address()

        if deposit_target:
            # A deposit address is configured, so the deposit must be real. An
            # unverifiable hash is rejected rather than silently trusted —
            # otherwise the commitment is theatre.
            if not payload.tx_hash:
                raise HTTPException(
                    400,
                    "tx_hash is required: send the deposit to "
                    f"{deposit_target} on Monad testnet first.",
                )
            result = MonadService().verify_deposit(
                tx_hash=payload.tx_hash,
                expected_from=user.wallet_address,
                expected_amount_mon=payload.amount_mon,
            )
            if not result["verified"]:
                raise HTTPException(
                    400, f"Deposit transaction could not be verified: {result['reason']}"
                )
            onchain_verified = True

        stake = Stake(
            id=uuid.uuid4(),
            user_id=user.id,
            stake_type=payload.stake_type,
            amount_mon=payload.amount_mon,
            room_id=payload.room_id,
            meetup_match_id=payload.meetup_match_id,
            target_user_id=payload.target_user_id,
            tx_hash=payload.tx_hash,
            onchain_verified=onchain_verified,
            status=StakeStatus.ACTIVE,
        )
        self.db.add(stake)
        self.db.commit()
        self.db.refresh(stake)

        # Record the decision in the event log. Non-fatal: the DB row is already
        # committed, and for a verified deposit `tx_hash` is the user's funding
        # transaction, which must not be overwritten by the record tx.
        record_tx = MonadService().submit_stake_record(
            stake_id=stake.id,
            user_wallet=getattr(user, "wallet_address", None),
            amount_mon=payload.amount_mon,
            stake_type=payload.stake_type.value,
        )
        if record_tx and not stake.tx_hash:
            stake.tx_hash = record_tx
            self.db.commit()
            self.db.refresh(stake)
        return stake

    def deposit_requirements(self, amount_mon: float) -> dict:
        """Tell the client where and how to send the deposit."""
        target = deposit_address()
        return {
            "chain_id": settings.MONAD_CHAIN_ID,
            "rpc_url": settings.MONAD_RPC_URL,
            "deposit_address": target or None,
            "amount_mon": amount_mon,
            "gas_limit": 21_000,
            "onchain_required": bool(target),
        }

    def get_user_stakes(self, user_id: UUID) -> List[Stake]:
        return self.db.query(Stake).filter(Stake.user_id == user_id).all()

    def get_or_404(self, stake_id: UUID, user: User) -> Stake:
        s = self.db.query(Stake).filter(Stake.id == stake_id, Stake.user_id == user.id).first()
        if not s:
            raise StakeNotFoundError()
        return s

    def refund(self, user: User, stake_id: UUID) -> Stake:
        stake = self.get_or_404(stake_id, user)
        return self._do_refund(stake, user.wallet_address)

    def refund_for_match(self, match_id: UUID) -> list[Stake]:
        """R6: release every active deposit backing a match.

        Called when an attestation confirms. Both sides are refunded together —
        neither party's refund depends on the other side's client doing anything.
        """
        stakes = (
            self.db.query(Stake)
            .filter(
                Stake.meetup_match_id == match_id,
                Stake.status.in_([StakeStatus.ACTIVE, StakeStatus.PENDING]),
            )
            .all()
        )
        refunded = []
        for stake in stakes:
            owner = self.db.query(User).filter(User.id == stake.user_id).first()
            refunded.append(
                self._do_refund(stake, owner.wallet_address if owner else None)
            )
        return refunded

    def mark_disputed_for_match(self, match_id: UUID, reason: str) -> list[Stake]:
        """R6/R7: hold deposits pending arbitration instead of penalising anyone.

        A one-sided check-in is not evidence of a no-show, so the funds are frozen
        for review rather than slashed. Nothing here moves money.
        """
        stakes = (
            self.db.query(Stake)
            .filter(
                Stake.meetup_match_id == match_id,
                Stake.status.in_([StakeStatus.ACTIVE, StakeStatus.PENDING]),
            )
            .all()
        )
        for stake in stakes:
            stake.status = StakeStatus.DISPUTED
            stake.slash_reason = None  # explicitly not a penalty
        if stakes:
            self.db.commit()
            for stake in stakes:
                self.db.refresh(stake)
        return stakes

    def _do_refund(self, stake: Stake, wallet_address: str | None) -> Stake:
        if stake.status not in (StakeStatus.ACTIVE, StakeStatus.PENDING):
            raise HTTPException(400, "Stake cannot be refunded in its current state")
        stake.status = StakeStatus.REFUNDED
        stake.resolved_at = datetime.utcnow()
        HCSAnchoringService().anchor_stake_decision(
            stake_id=stake.id,
            user_id=stake.user_id,
            decision="refunded",
            amount_mon=stake.amount_mon,
        )
        MonadService().submit_refund_record(
            stake_id=stake.id,
            user_wallet=wallet_address,
            amount_mon=stake.amount_mon,
        )
        self.db.commit()
        self.db.refresh(stake)
        return stake

    def slash(self, user: User, stake_id: UUID, reason: str) -> Stake:
        stake = self.db.query(Stake).filter(Stake.id == stake_id).first()
        if not stake:
            raise StakeNotFoundError()
        stake.status = StakeStatus.SLASHED
        stake.slash_reason = reason
        stake.resolved_at = datetime.utcnow()
        HCSAnchoringService().anchor_stake_decision(
            stake_id=stake.id,
            user_id=stake.user_id,
            decision="slashed",
            amount_mon=stake.amount_mon,
            slash_reason=reason,
        )
        tx_hash = MonadService().submit_slash_record(
            stake_id=stake.id,
            user_wallet=getattr(stake, "user_wallet_address", None),
            amount_mon=stake.amount_mon,
            reason=reason,
        )
        if tx_hash:
            stake.tx_hash = tx_hash
        self.db.commit()
        self.db.refresh(stake)
        return stake
