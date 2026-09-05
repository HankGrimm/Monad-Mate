"""
Managed (AA-style) wallet endpoints — the no-seed-phrase onboarding path.

Security note: accounts created here are custodial. Every response carries a
custody disclosure so the client can surface it; see
``services/managed_wallet_service.py`` for the full trade-off write-up.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from ..core.auth import get_current_user
from ..core.database import get_db
from ..models.user import User
from ..schemas.user import WalletAuthToken, UserResponse
from ..services.managed_wallet_service import ManagedWalletService

router = APIRouter(prefix="/v1/wallet", tags=["managed-wallet"])


class LoginCodeRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=32)


class LoginCodeResponse(BaseModel):
    subject: str
    expires_at: datetime
    delivery: str
    code: Optional[str] = Field(
        None,
        description="Only populated in development environments; never in production.",
    )


class LoginVerifyRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=32)


class AccountInfoResponse(BaseModel):
    wallet_address: str
    wallet_kind: str
    managed: bool
    gas_sponsored: bool
    custody_disclosure: str


class LinkExternalWalletRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str


@router.post("/login/code", response_model=LoginCodeResponse)
async def request_login_code(
    payload: LoginCodeRequest,
    db: Session = Depends(get_db),
):
    """Start a passwordless login. No wallet, seed phrase, or gas involved."""
    return ManagedWalletService(db).request_code(
        email=payload.email, phone=payload.phone
    )


@router.post("/login/verify", response_model=WalletAuthToken)
async def verify_login_code(
    payload: LoginVerifyRequest,
    db: Session = Depends(get_db),
):
    """Exchange a login code for a session; provisions a managed account."""
    return ManagedWalletService(db).verify_code(
        payload.code, email=payload.email, phone=payload.phone
    )


@router.get("/me", response_model=AccountInfoResponse)
async def get_account_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ManagedWalletService(db).account_info(current_user)


@router.post("/link-external", response_model=UserResponse)
async def link_external_wallet(
    payload: LinkExternalWalletRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move a managed account to self-custody by proving external key ownership."""
    return ManagedWalletService(db).link_external_wallet(
        current_user, payload.wallet_address, payload.signature, payload.nonce
    )
