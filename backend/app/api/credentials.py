"""
Fulfilment credential (SBT) + credit endpoints — R8 / R9.

No public leaderboard or comparative ranking is exposed: P0/P1 explicitly
excludes social credit display (PRD §8).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID

from ..core.auth import get_current_user
from ..core.database import get_db
from ..models.user import User
from ..schemas.fulfilment_credential import (
    CredentialListResponse, CredentialResponse, CreditResponse,
    IssueCredentialRequest,
)
from ..services.fulfilment_credential_service import FulfilmentCredentialService

router = APIRouter(prefix="/v1/credentials", tags=["credentials"])


@router.post("", response_model=list[CredentialResponse], status_code=201)
async def issue_credentials(
    payload: IssueCredentialRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mint soulbound credentials for both parties of a confirmed attestation."""
    return FulfilmentCredentialService(db).issue_for_attestation(
        payload.attestation_id, payload.outcome
    )


@router.get("/me", response_model=CredentialListResponse)
async def list_my_credentials(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = FulfilmentCredentialService(db).list_for_user(
        current_user.id, limit=limit, offset=offset
    )
    return {"items": items, "total": total}


@router.get("/me/credit", response_model=CreditResponse)
async def get_my_credit(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Credit view. The score stays hidden until enough history exists."""
    return FulfilmentCredentialService(db).get_credit(current_user.id)
