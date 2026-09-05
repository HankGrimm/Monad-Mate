"""
Identity verification endpoints — R4.

Honest framing: the phone step proves control of a number; the ID step is a
demo stub that verifies nothing and is disabled outside development. Every ID
response carries a disclosure saying so.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from ..core.auth import get_current_user
from ..core.database import get_db
from ..models.user import User
from ..schemas.user import UserResponse
from ..services.verification_service import VerificationService

router = APIRouter(prefix="/v1/verification", tags=["verification"])


class VerificationStatus(BaseModel):
    verification_level: str
    can_create_meetups: bool
    phone_verified: bool
    id_verified: bool
    id_verification_is_stub: bool
    next_step: Optional[str]


class PhoneStartRequest(BaseModel):
    phone: str = Field(..., max_length=32)


class PhoneStartResponse(BaseModel):
    phone: str
    expires_at: datetime
    delivery: str
    code: Optional[str] = Field(
        None, description="Only returned in development environments."
    )


class PhoneConfirmRequest(BaseModel):
    phone: str = Field(..., max_length=32)
    code: str = Field(..., min_length=4, max_length=12)


class IdSubmitRequest(BaseModel):
    document_number: str = Field(..., min_length=6, max_length=64)
    birth_year: Optional[int] = Field(None, ge=1900, le=2020)


class IdSubmitResponse(BaseModel):
    verification_level: str
    age_verified: bool
    is_stub: bool
    disclosure: str


@router.get("/me", response_model=VerificationStatus)
async def get_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current tier and what it unlocks."""
    return VerificationService(db).status(current_user)


@router.post("/phone/start", response_model=PhoneStartResponse)
async def start_phone(
    payload: PhoneStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a verification code to a phone number."""
    return VerificationService(db).start_phone(current_user, payload.phone)


@router.post("/phone/confirm", response_model=UserResponse)
async def confirm_phone(
    payload: PhoneConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm the code and raise the tier to `phone`."""
    return VerificationService(db).confirm_phone(
        current_user, payload.phone, payload.code
    )


@router.post("/id/submit", response_model=IdSubmitResponse)
async def submit_id(
    payload: IdSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Raise the tier to `id`.

    No identity provider is integrated — this records a salted hash of the
    document number (never the number itself) and nothing is actually verified.
    Returns 503 when the deployment has not opted into the stub.
    """
    return VerificationService(db).submit_id(
        current_user, payload.document_number, payload.birth_year
    )
