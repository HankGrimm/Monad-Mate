from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

from ..models.fulfilment_credential import CredentialOutcome, CredentialMintStatus


class CredentialResponse(BaseModel):
    id: UUID
    holder_id: UUID
    attestation_id: Optional[UUID]
    venue_type: Optional[str]
    scene: Optional[str]
    occurred_at: Optional[datetime]
    duration_minutes: Optional[int]
    outcome: CredentialOutcome
    soulbound: bool
    token_id: Optional[str]
    contract_address: Optional[str]
    tx_hash: Optional[str]
    mint_status: CredentialMintStatus
    metadata_json: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class CredentialListResponse(BaseModel):
    items: List[CredentialResponse]
    total: int


class IssueCredentialRequest(BaseModel):
    attestation_id: UUID
    outcome: CredentialOutcome = CredentialOutcome.KEPT


class CreditResponse(BaseModel):
    user_id: str
    fulfilled_count: int
    no_show_count: int
    disputed_count: int
    score_available: bool = Field(
        ..., description="False until the holder has enough fulfilment history."
    )
    credit_score: Optional[float]
    breakdown: Optional[Dict[str, Any]]
    required_fulfilments: int
    disclaimer: str
