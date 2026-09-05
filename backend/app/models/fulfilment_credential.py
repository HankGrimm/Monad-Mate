"""
Fulfilment credential (SBT) — R8 of the PRD.

A soulbound, non-transferable token minted after a meetup is attested by both
parties.  Metadata deliberately carries **no counterparty identity**: only the
time, venue category, scene and whether the holder kept their commitment.

Also holds ``CreditProfile`` (R9/R11): the aggregate view over a user's
fulfilment history that feeds back into matching weights.
"""
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Enum as SAEnum, Boolean, Float,
    Integer, JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

from ..core.database import Base


class CredentialOutcome(str, enum.Enum):
    KEPT = "kept"          # 守约
    NO_SHOW = "no_show"    # 未赴约（经仲裁认定）
    DISPUTED = "disputed"  # 争议中，尚未定论


class CredentialMintStatus(str, enum.Enum):
    PENDING = "pending"
    MINTED = "minted"
    FAILED = "failed"


class FulfilmentCredential(Base):
    """Soulbound record of one completed (or failed) meetup commitment."""

    __tablename__ = "sm_fulfilment_credentials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    holder_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attestation_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_meetup_attestations.id", ondelete="SET NULL"),
        nullable=True,
    )
    meetup_request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_meetup_requests.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Privacy-safe metadata (no counterparty identity) ---
    venue_type = Column(String(32), nullable=True)      # mall / supermarket
    scene = Column(String(32), nullable=True)            # dining / entertainment / shopping
    occurred_at = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    outcome = Column(
        SAEnum(CredentialOutcome), default=CredentialOutcome.KEPT, nullable=False
    )

    # --- On-chain state ---
    soulbound = Column(Boolean, default=True, nullable=False)
    token_id = Column(String, nullable=True)
    contract_address = Column(String, nullable=True)
    tx_hash = Column(String, nullable=True)
    metadata_json = Column(JSON, default=dict, nullable=False)
    mint_status = Column(
        SAEnum(CredentialMintStatus),
        default=CredentialMintStatus.PENDING,
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    minted_at = Column(DateTime, nullable=True)


class CreditProfile(Base):
    """Aggregated fulfilment history — R9 credit score + R11 matching features.

    ``scene_preference`` / ``time_slot_preference`` are frequency maps built
    from past fulfilments; the matcher uses them to favour candidates with
    similar habits once enough history exists.
    """

    __tablename__ = "sm_credit_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    fulfilled_count = Column(Integer, default=0, nullable=False)
    no_show_count = Column(Integer, default=0, nullable=False)
    disputed_count = Column(Integer, default=0, nullable=False)
    credit_score = Column(Float, default=50.0, nullable=False)
    score_breakdown = Column(JSON, default=dict, nullable=False)
    scene_preference = Column(JSON, default=dict, nullable=False)      # {scene: count}
    time_slot_preference = Column(JSON, default=dict, nullable=False)  # {hour_bucket: count}
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
