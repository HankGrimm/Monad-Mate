"""
Meetup request endpoints — R1 发起-匹配-确认 flow.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from ..core.auth import get_current_user
from ..core.database import get_db
from ..models.user import User
from ..schemas.meetup_request import (
    MeetupCandidate, MeetupMatchDecision, MeetupMatchDetail, MeetupMatchResponse,
    MeetupRequestCreate, MeetupRequestResponse,
)
from ..services.meetup_request_service import MeetupRequestService

router = APIRouter(prefix="/v1/meetups", tags=["meetups"])


@router.post("/requests", response_model=MeetupRequestResponse, status_code=201)
async def create_request(
    payload: MeetupRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Broadcast an immediate, on-site meetup intent."""
    return MeetupRequestService(db).create(current_user, payload)


@router.get("/requests", response_model=List[MeetupRequestResponse])
async def list_my_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MeetupRequestService(db).list_mine(current_user)


@router.get("/requests/{request_id}", response_model=MeetupRequestResponse)
async def get_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MeetupRequestService(db).get_or_404(request_id)


@router.post("/requests/{request_id}/cancel", response_model=MeetupRequestResponse)
async def cancel_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MeetupRequestService(db).cancel(current_user, request_id)


@router.get("/requests/{request_id}/candidates", response_model=List[MeetupCandidate])
async def get_candidates(
    request_id: UUID,
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ranked candidates at the same venue in an overlapping time window.

    Returns an empty list when nothing qualifies — candidates are never padded
    with weak matches.
    """
    return MeetupRequestService(db).find_candidates(
        current_user, request_id, limit=limit
    )


@router.post(
    "/requests/{request_id}/propose/{counterpart_request_id}",
    response_model=MeetupMatchResponse,
    status_code=201,
)
async def propose_match(
    request_id: UUID,
    counterpart_request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept a candidate, creating the pairing and recording your acceptance."""
    return MeetupRequestService(db).propose(
        current_user, request_id, counterpart_request_id
    )


@router.get("/requests/{request_id}/matches", response_model=List[MeetupMatchResponse])
async def list_matches(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return MeetupRequestService(db).list_matches(current_user, request_id)


@router.get("/matches/{match_id}", response_model=MeetupMatchDetail)
async def get_match(
    match_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Participant view of a pairing.

    Returns the shared meetup details plus the counterpart's display name,
    verification state and fulfilment count — never their identifiers.
    """
    return MeetupRequestService(db).match_detail(current_user, match_id)


@router.post("/matches/{match_id}/respond", response_model=MeetupMatchResponse)
async def respond_to_match(
    match_id: UUID,
    payload: MeetupMatchDecision,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept or pass. Passing terminates the pairing with no credit impact."""
    return MeetupRequestService(db).respond(current_user, match_id, payload.accept)
