from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

from ..models.meetup_request import (
    VenueType, SceneType, MeetupRequestStatus, GenderPreference,
    MeetupMatchStatus,
)


class MeetupRequestCreate(BaseModel):
    venue_type: VenueType
    venue_name: str = Field(..., min_length=1, max_length=128)
    venue_key: str = Field(
        ..., min_length=1, max_length=128,
        description="Stable venue identifier (POI id). Same key == same building.",
    )
    scene: SceneType
    note: Optional[str] = Field(None, max_length=300)
    party_size: int = Field(2, ge=2, le=8)
    duration_minutes: int = Field(60, ge=15, le=240)
    window_start: Optional[datetime] = Field(
        None, description="Defaults to now when omitted."
    )
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    persona_id: Optional[UUID] = None

    # R10 safety preferences
    gender_preference: GenderPreference = GenderPreference.ANY
    require_verified: bool = False
    min_reputation_score: Optional[float] = Field(None, ge=0, le=100)


class MeetupRequestResponse(BaseModel):
    id: UUID
    user_id: UUID
    venue_type: VenueType
    venue_name: str
    venue_key: str
    scene: SceneType
    note: Optional[str]
    party_size: int
    duration_minutes: int
    window_start: datetime
    window_end: datetime
    gender_preference: GenderPreference
    require_verified: bool
    min_reputation_score: Optional[float]
    status: MeetupRequestStatus
    created_at: datetime

    class Config:
        from_attributes = True


class MeetupCandidate(BaseModel):
    """One ranked candidate for an open request."""
    match_id: Optional[UUID] = None
    counterpart_request_id: UUID
    counterpart_user_id: UUID
    display_name: Optional[str] = None
    scene: SceneType
    venue_name: str
    score: float
    reasons: List[str] = []
    breakdown: Dict[str, Any] = {}
    credit_score: Optional[float] = None
    fulfilled_count: int = 0
    verified: bool = False


class MeetupMatchResponse(BaseModel):
    id: UUID
    request_id: UUID
    counterpart_request_id: UUID
    score: float
    reasons: List[str]
    status: MeetupMatchStatus
    requester_accepted: bool
    counterpart_accepted: bool
    created_at: datetime
    confirmed_at: Optional[datetime]

    class Config:
        from_attributes = True


class MeetupMatchDecision(BaseModel):
    accept: bool = Field(..., description="True to accept, False to pass (no penalty).")


class MeetupCounterpart(BaseModel):
    """Only what a participant may see about the other side."""
    display_name: Optional[str] = None
    verified: bool = False
    fulfilled_count: int = 0
    credit_score: Optional[float] = None


class MeetupMatchDetail(BaseModel):
    """Participant view of a pairing, used by the confirm/deposit screen."""
    id: UUID
    status: MeetupMatchStatus
    score: float
    reasons: List[str] = []
    you_accepted: bool
    they_accepted: bool
    confirmed_at: Optional[datetime] = None
    own_request_id: UUID
    venue_type: VenueType
    venue_name: str
    scene: SceneType
    window_start: datetime
    window_end: datetime
    party_size: int
    counterpart: MeetupCounterpart
