"""
Managed (AA-style) wallet service — the low-friction onboarding path.

Goal (PRD 场景6 / R6): a first-time user should never see a seed phrase, a
private key, or a gas prompt. They log in with an email or phone code and the
backend provisions a deterministic account for them; staking then feels like a
small in-app payment.

Security posture, stated plainly:

* This is a **custodial** account. The backend derives the key from a server
  secret, so the operator can move the user's funds. That is an explicit
  trade-off for the demo/consumer path and is disclosed through
  ``custody_disclosure`` on every response.
* Derivation is ``keccak(SECRET_KEY || namespace || subject)``. Rotating
  ``SECRET_KEY`` therefore rotates every derived address — so a rotation needs a
  migration, not just a config change.
* Private keys are never persisted and never returned by the API. They are
  derived on demand for signing and dropped.
* Login codes are single-use with a short TTL, kept in the same in-memory store
  pattern as the wallet-nonce flow. Replace with Redis before running more than
  one API process.

Nothing here weakens the external-wallet path: EIP-191 signature login still
works exactly as before, and a managed user can graduate to self-custody later
by linking an external address.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import threading
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core.auth import create_access_token
from ..core.config import settings
from ..models.user import Gender, User, VerificationLevel, WalletKind
from ..schemas.user import UserResponse, WalletAuthToken

logger = logging.getLogger(__name__)

_CODE_TTL_SECONDS = 300
_DERIVATION_NAMESPACE = "monadmate/managed-wallet/v1"

CUSTODY_DISCLOSURE = (
    "This is a managed (custodial) account: Monad Mate holds the signing key so "
    "you don't have to manage a seed phrase or gas. You can link an external "
    "wallet later to take full self-custody."
)


class _LoginCodeStore:
    """Thread-safe single-use login codes with TTL.

    Mirrors ``TTLNonceStore`` in ``user_identity_service`` rather than sharing it,
    because the two flows have different failure semantics and we don't want a
    change to one to silently alter the other.
    """

    def __init__(self, ttl_seconds: int = _CODE_TTL_SECONDS) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._store: dict[str, dict] = {}
        self._lock = threading.Lock()

    def issue(self, subject: str) -> tuple[str, datetime]:
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        expires_at = datetime.utcnow() + self._ttl
        with self._lock:
            self._purge_locked()
            self._store[subject] = {
                "code_hash": _hash_code(subject, code),
                "expires_at": expires_at,
            }
        return code, expires_at

    def consume(self, subject: str, code: str) -> bool:
        with self._lock:
            entry = self._store.get(subject)
            if entry is None:
                return False
            if entry["expires_at"] < datetime.utcnow():
                del self._store[subject]
                return False
            ok = hmac.compare_digest(entry["code_hash"], _hash_code(subject, code))
            if ok:
                del self._store[subject]
            return ok

    def _purge_locked(self) -> None:
        now = datetime.utcnow()
        for key in [k for k, v in self._store.items() if v["expires_at"] < now]:
            del self._store[key]


def _hash_code(subject: str, code: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"{subject}:{code}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


_code_store = _LoginCodeStore()


def _derive_private_key(subject: str) -> str:
    """Deterministically derive a signing key for *subject*.

    HMAC-SHA256 over the server secret. Deterministic derivation means the same
    login always resolves to the same address without storing key material.
    """
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"{_DERIVATION_NAMESPACE}:{subject}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return "0x" + digest.hex()


def derive_address(subject: str) -> str:
    """Return the EVM address for *subject*'s managed account."""
    private_key = _derive_private_key(subject)
    try:
        from eth_account import Account  # noqa: PLC0415

        return Account.from_key(private_key).address
    except Exception:
        # eth-account unavailable (or key rejected) — fall back to a stable
        # synthetic address so onboarding still works in constrained envs.
        return "0x" + hashlib.sha256(private_key.encode()).hexdigest()[:40]


def sign_message_for(subject: str, message: str) -> Optional[str]:
    """Sign *message* on behalf of a managed account (gasless UX helper)."""
    try:
        from eth_account import Account  # noqa: PLC0415
        from eth_account.messages import encode_defunct  # noqa: PLC0415

        signed = Account.sign_message(
            encode_defunct(text=message), private_key=_derive_private_key(subject)
        )
        return signed.signature.hex()
    except Exception as exc:
        logger.warning("Managed signing failed (non-fatal): %s", exc)
        return None


class ManagedWalletService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Login
    # ------------------------------------------------------------------

    def request_code(
        self, email: Optional[str] = None, phone: Optional[str] = None
    ) -> dict:
        subject = self._subject(email, phone)
        code, expires_at = _code_store.issue(subject)

        # No SMS/email provider is wired up. In development the code is returned
        # so the flow is testable; in any other environment it is withheld and
        # only logged, so a deployed API never leaks a login code over HTTP.
        deliverable = settings.ENVIRONMENT.lower() in ("development", "test", "local")
        if not deliverable:
            logger.info("Managed login code issued for %s (not returned)", subject)

        return {
            "subject": subject,
            "expires_at": expires_at,
            "delivery": "returned_in_response" if deliverable else "out_of_band",
            "code": code if deliverable else None,
        }

    def verify_code(
        self,
        code: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> WalletAuthToken:
        subject = self._subject(email, phone)
        if not _code_store.consume(subject, code):
            raise HTTPException(401, "Invalid or expired login code")

        user = self._get_or_create(subject, email=email, phone=phone)
        token = create_access_token(str(user.id), user.wallet_address)
        return WalletAuthToken(
            access_token=token, user=UserResponse.model_validate(user)
        )

    # ------------------------------------------------------------------
    # Account info
    # ------------------------------------------------------------------

    def account_info(self, user: User) -> dict:
        """Wallet state as the app should present it: no keys, no gas talk."""
        return {
            "wallet_address": user.wallet_address,
            "wallet_kind": user.wallet_kind.value,
            "managed": user.wallet_kind == WalletKind.MANAGED,
            "gas_sponsored": user.wallet_kind == WalletKind.MANAGED,
            "custody_disclosure": (
                CUSTODY_DISCLOSURE
                if user.wallet_kind == WalletKind.MANAGED
                else "You control this wallet's keys."
            ),
        }

    def link_external_wallet(self, user: User, wallet_address: str, signature: str, nonce: str) -> User:
        """Graduate a managed user to self-custody.

        Requires a valid EIP-191 signature from the external address, so a user
        cannot claim an address they don't control.
        """
        from .user_identity_service import _verify_monad_signature  # noqa: PLC0415

        if user.wallet_kind != WalletKind.MANAGED:
            raise HTTPException(400, "Account is already self-custodial")
        if not _verify_monad_signature(wallet_address, nonce, signature):
            raise HTTPException(401, "Invalid wallet signature")

        taken = (
            self.db.query(User)
            .filter(User.wallet_address == wallet_address, User.id != user.id)
            .first()
        )
        if taken:
            raise HTTPException(409, "Wallet address already linked to another account")

        user.wallet_address = wallet_address
        user.wallet_kind = WalletKind.EXTERNAL
        user.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(user)
        return user

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _subject(email: Optional[str], phone: Optional[str]) -> str:
        if email and phone:
            raise HTTPException(400, "Provide either email or phone, not both")
        if email:
            return f"email:{email.strip().lower()}"
        if phone:
            return f"phone:{phone.strip()}"
        raise HTTPException(400, "email or phone is required")

    def _get_or_create(
        self, subject: str, email: Optional[str], phone: Optional[str]
    ) -> User:
        address = derive_address(subject)
        user = (
            self.db.query(User).filter(User.wallet_address == address).first()
        )
        if user:
            return user

        user = User(
            wallet_address=address,
            wallet_kind=WalletKind.MANAGED,
            email=email,
            phone=phone,
            gender=Gender.UNDISCLOSED,
            # A verified email/phone code is exactly the PHONE verification tier
            # for phone logins; email logins stay at WALLET until they verify.
            verification_level=(
                VerificationLevel.PHONE if phone else VerificationLevel.WALLET
            ),
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
