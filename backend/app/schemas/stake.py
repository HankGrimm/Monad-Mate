from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime
from uuid import UUID
from ..models.stake import StakeType, StakeStatus


class StakeCreate(BaseModel):
    stake_type: StakeType
    amount_mon: float = Field(..., gt=0)
    room_id: Optional[UUID] = None
    target_user_id: Optional[UUID] = None
    meetup_match_id: Optional[UUID] = Field(
        None,
        description="Meetup this deposit backs. Required for confirm_meetup so the "
        "deposit can be auto-refunded when both sides check in.",
    )
    tx_hash: Optional[str] = Field(
        None,
        description="Funding transaction on Monad. Required when a deposit "
        "address is configured; verified on-chain before the stake goes active.",
    )


class StakeResponse(BaseModel):
    id: UUID
    user_id: UUID
    stake_type: StakeType
    status: StakeStatus
    amount_mon: float
    currency: str
    tx_hash: Optional[str]
    onchain_verified: bool = False
    meetup_match_id: Optional[UUID] = None
    escrow_id: Optional[UUID]
    expires_at: Optional[datetime]
    created_at: datetime
    resolved_at: Optional[datetime]
    explorer_url: Optional[str] = None

    @model_validator(mode="after")
    def _set_explorer_url(self) -> "StakeResponse":
        if self.tx_hash:
            self.explorer_url = (
                f"https://testnet.monadexplorer.com/tx/{self.tx_hash}"
            )
        return self

    class Config:
        from_attributes = True


class DepositRequirements(BaseModel):
    """What the client needs in order to send a real testnet deposit."""
    chain_id: int
    rpc_url: str
    deposit_address: Optional[str] = Field(
        None, description="None means on-chain deposits are not configured."
    )
    amount_mon: float
    # Native transfers are always exactly 21,000 gas. Monad charges on the gas
    # *limit* rather than usage, so the client must not pad an estimate here.
    gas_limit: int = 21_000
    onchain_required: bool
    explorer_base: str = "https://testnet.monadexplorer.com"


class StakeSlash(BaseModel):
    reason: str = Field(..., min_length=10)
