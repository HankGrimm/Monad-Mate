"""
Meetup request models — R1 of the PRD.

A ``MeetupRequest`` is a user broadcasting an *immediate, on-site* intent:
"I'm in this mall right now, looking for 1 person to eat with for the next
hour".  Matching is constrained to the same venue and an overlapping time
window, which is what separates this from generic room-based discovery.

``MeetupRequestMatch`` records a candidate pairing between two open requests
and tracks the two-sided confirmation handshake.
"""
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Enum as SAEnum, Boolean, Float,
    Integer, JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from ..core.database import Base


class VenueType(str, enum.Enum):
    """Physical venue category the request is anchored to."""
    MALL = "mall"                  # 大型综合商场
    SUPERMARKET = "supermarket"    # 大型生活超市


class SceneType(str, enum.Enum):
    """What the user actually wants to do right now."""
    DINING = "dining"                # 吃饭 / 探店
    ENTERTAINMENT = "entertainment"  # 电玩 / 桌游 / 展览
    SHOPPING = "shopping"            # 采购结伴 / 拼单


class MeetupRequestStatus(str, enum.Enum):
    OPEN = "open"              # waiting for candidates
    MATCHED = "matched"        # a candidate pairing exists, awaiting confirms
    CONFIRMED = "confirmed"    # both sides confirmed → proceeds to stake
    EXPIRED = "expired"        # time window passed without a confirm
    CANCELLED = "cancelled"    # withdrawn by the user
    FULFILLED = "fulfilled"    # meetup happened and was attested


class GenderPreference(str, enum.Enum):
    """R10 — safety preference. ``SAME_ONLY`` is a hard filter, never a soft rank."""
    ANY = "any"
    SAME_ONLY = "same_only"


class MeetupRequest(Base):
    __tablename__ = "sm_meetup_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    persona_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_personas.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Where (the core constraint) ---
    venue_type = Column(SAEnum(VenueType), nullable=False)
    venue_name = Column(String(128), nullable=False)
    # Stable venue key (e.g. POI id). Same key == same building, which is a
    # stricter and cheaper check than a GPS radius for indoor venues.
    venue_key = Column(String(128), nullable=False, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # --- What / when ---
    scene = Column(SAEnum(SceneType), nullable=False, index=True)
    note = Column(String(300), nullable=True)       # free-text "现在想做什么"
    party_size = Column(Integer, default=2, nullable=False)   # incl. the requester
    duration_minutes = Column(Integer, default=60, nullable=False)
    window_start = Column(DateTime, nullable=False)
    window_end = Column(DateTime, nullable=False, index=True)

    # --- R10 safety preferences ---
    gender_preference = Column(
        SAEnum(GenderPreference), default=GenderPreference.ANY, nullable=False
    )
    require_verified = Column(Boolean, default=False, nullable=False)
    min_reputation_score = Column(Float, nullable=True)

    status = Column(
        SAEnum(MeetupRequestStatus),
        default=MeetupRequestStatus.OPEN,
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class MeetupMatchStatus(str, enum.Enum):
    PENDING = "pending"        # surfaced to both sides, nobody acted yet
    ACCEPTED = "accepted"      # one side accepted
    CONFIRMED = "confirmed"    # both accepted → team formed
    DECLINED = "declined"      # someone passed (no reputation penalty)
    EXPIRED = "expired"


class MeetupRequestMatch(Base):
    """A candidate pairing between two open requests at the same venue."""

    __tablename__ = "sm_meetup_request_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_meetup_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    counterpart_request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_meetup_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    score = Column(Float, default=0.0, nullable=False)
    # Human-readable reasons, so the UI can explain *why* this person surfaced
    # (PRD R2 requires the match to be explainable).
    score_breakdown = Column(JSON, default=dict, nullable=False)
    reasons = Column(JSON, default=list, nullable=False)

    status = Column(
        SAEnum(MeetupMatchStatus), default=MeetupMatchStatus.PENDING, nullable=False
    )
    requester_accepted = Column(Boolean, default=False, nullable=False)
    counterpart_accepted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
