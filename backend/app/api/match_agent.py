from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from ..core.database import get_db
from ..core.auth import get_current_user
from ..models.user import User
from ..schemas.match import MatchResponse
from ..services.matchmaking_service import MatchmakingService

router = APIRouter(prefix="/v1/ai/match-agent", tags=["ai-matchmaking"])


class PreferencesPayload:
    pass


from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class PreferencesUpdate(BaseModel):
    intent_mode: Optional[str] = None
    age_range: Optional[Dict[str, int]] = None
    interests: Optional[List[str]] = None
    dealbreakers: Optional[List[str]] = None
    location_range_km: Optional[float] = None
    personality_traits: Optional[List[str]] = None

    # R2 persona dimensions. A birth date is taken rather than a sign so 星座
    # and 生肖 are derived server-side and stay consistent.
    birth_date: Optional[str] = Field(
        None, description="ISO date (YYYY-MM-DD). Used to derive 星座 and 生肖."
    )
    mbti: Optional[str] = Field(None, max_length=4)
    sleep_schedule: Optional[str] = Field(
        None, description="early | night | flexible"
    )

    # R2 realistic dimensions
    occupation: Optional[str] = Field(None, max_length=64)
    industry: Optional[str] = Field(None, max_length=64)
    education: Optional[str] = Field(None, max_length=32)
    city: Optional[str] = Field(None, max_length=64)

    extra: Optional[Dict[str, Any]] = None


class MatchSuggestion(BaseModel):
    persona_id: UUID
    compatibility_score: float
    intro_suggestion: Optional[str]
    shared_interests: List[str]
    room_context: Optional[str]


class IntroPayload(BaseModel):
    target_persona_id: UUID
    context: Optional[str] = None


class FilterPayload(BaseModel):
    min_reputation_score: Optional[float] = None
    required_intent_mode: Optional[str] = None
    max_no_show_rate: Optional[float] = None


@router.post("/preferences", status_code=200)
async def update_preferences(
    payload: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = MatchmakingService(db)
    return svc.update_preferences(current_user, payload.model_dump(exclude_none=True))


@router.get("/suggestions", response_model=List[MatchSuggestion])
async def get_suggestions(
    room_id: Optional[UUID] = None,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = MatchmakingService(db)
    return svc.get_suggestions(current_user, room_id=room_id, limit=limit)


@router.post("/intro", status_code=200)
async def generate_intro(
    payload: IntroPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = MatchmakingService(db)
    return svc.generate_intro(current_user, payload.target_persona_id, payload.context)


@router.post("/filter", status_code=200)
async def apply_filter(
    payload: FilterPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = MatchmakingService(db)
    return svc.apply_vibe_filter(current_user, payload.model_dump(exclude_none=True))
