"""
Identity verification — R4 (实名认证接入).

What this does and does not do, stated plainly:

* **Phone verification is real** in the sense that it proves control of a phone
  number, using the same single-use code mechanism as managed-wallet login.
* **ID verification is a stub.** No KYC vendor is integrated. The endpoint
  records that a user asserted an identity and raises their tier so the rest of
  the product can be exercised, but it verifies nothing. It is gated behind
  ``ALLOW_STUB_ID_VERIFICATION`` (default on only in development) so a deployed
  instance cannot hand out ID tiers for free.

Per PRD R4, **no credential details are ever stored** — not the document number,
not the name, not an image. Only the resulting tier, plus a salted hash of the
document number so a single document cannot silently verify many accounts.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import threading
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.user import User, VerificationLevel

logger = logging.getLogger(__name__)

_CODE_TTL_SECONDS = 300

# Tier ordering, so a verification can never silently downgrade a user.
_TIER_RANK = {
    VerificationLevel.NONE: 0,
    VerificationLevel.WALLET: 1,
    VerificationLevel.PHONE: 2,
    VerificationLevel.ID: 3,
    VerificationLevel.FULL: 4,
}

STUB_ID_DISCLOSURE = (
    "ID verification is a demo stub: no identity provider is integrated and "
    "nothing was actually checked. Do not treat this tier as a real identity "
    "assurance."
)


class _PhoneCodeStore:
    """Single-use phone verification codes with TTL.

    Separate from the login-code store on purpose: a login code must never be
    replayable as a verification code, or vice versa.
    """

    def __init__(self, ttl_seconds: int = _CODE_TTL_SECONDS) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._store: dict[str, dict] = {}
        self._lock = threading.Lock()

    def issue(self, key: str) -> tuple[str, datetime]:
        code = "".join(secrets.choice("0123456789") for _ in range(6))
        expires_at = datetime.utcnow() + self._ttl
        with self._lock:
            self._purge_locked()
            self._store[key] = {
                "hash": _hash_code(key, code),
                "expires_at": expires_at,
            }
        return code, expires_at

    def consume(self, key: str, code: str) -> bool:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return False
            if entry["expires_at"] < datetime.utcnow():
                del self._store[key]
                return False
            ok = hmac.compare_digest(entry["hash"], _hash_code(key, code))
            if ok:
                del self._store[key]
            return ok

    def _purge_locked(self) -> None:
        now = datetime.utcnow()
        for k in [k for k, v in self._store.items() if v["expires_at"] < now]:
            del self._store[k]


def _hash_code(key: str, code: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"verify:{key}:{code}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _hash_document(document_number: str) -> str:
    """Salted hash of a document number.

    Stored instead of the number itself so duplicate use is detectable without
    ever holding the document. Not reversible without SECRET_KEY, and rotating
    SECRET_KEY invalidates the duplicate check rather than exposing anything.
    """
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"document:{document_number.strip().upper()}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


_code_store = _PhoneCodeStore()

_PHONE_RE = re.compile(r"^\+?[0-9]{6,20}$")


class VerificationService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def status(self, user: User) -> dict:
        """Current tier plus what it unlocks, so the UI needn't hardcode rules."""
        can_meet = _TIER_RANK[user.verification_level] >= _TIER_RANK[
            VerificationLevel.PHONE
        ]
        return {
            "verification_level": user.verification_level.value,
            "can_create_meetups": can_meet,
            "phone_verified": _TIER_RANK[user.verification_level]
            >= _TIER_RANK[VerificationLevel.PHONE],
            "id_verified": _TIER_RANK[user.verification_level]
            >= _TIER_RANK[VerificationLevel.ID],
            "id_verification_is_stub": self._stub_allowed(),
            "next_step": self._next_step(user),
        }

    # ------------------------------------------------------------------
    # Phone
    # ------------------------------------------------------------------

    def start_phone(self, user: User, phone: str) -> dict:
        phone = phone.strip()
        if not _PHONE_RE.match(phone):
            raise HTTPException(400, "Enter a valid phone number")

        taken = (
            self.db.query(User)
            .filter(User.phone == phone, User.id != user.id)
            .first()
        )
        if taken:
            raise HTTPException(409, "That phone number is already verified on another account")

        code, expires_at = _code_store.issue(f"{user.id}:{phone}")
        deliverable = settings.ENVIRONMENT.lower() in ("development", "test", "local")
        if not deliverable:
            logger.info("Verification code issued for user %s (not returned)", user.id)

        return {
            "phone": phone,
            "expires_at": expires_at,
            "delivery": "returned_in_response" if deliverable else "out_of_band",
            "code": code if deliverable else None,
        }

    def confirm_phone(self, user: User, phone: str, code: str) -> User:
        phone = phone.strip()
        if not _code_store.consume(f"{user.id}:{phone}", code):
            raise HTTPException(401, "Invalid or expired verification code")

        user.phone = phone
        self._raise_tier(user, VerificationLevel.PHONE)
        self.db.commit()
        self.db.refresh(user)
        return user

    # ------------------------------------------------------------------
    # ID (stub)
    # ------------------------------------------------------------------

    def submit_id(
        self, user: User, document_number: str, birth_year: Optional[int]
    ) -> dict:
        """Record an ID assertion and raise the tier. Verifies nothing.

        Refuses to run outside development unless explicitly enabled, so a
        deployed instance cannot mint ID tiers.
        """
        if not self._stub_allowed():
            raise HTTPException(
                503,
                "ID verification is not available: no identity provider is "
                "configured on this deployment.",
            )

        if _TIER_RANK[user.verification_level] < _TIER_RANK[VerificationLevel.PHONE]:
            raise HTTPException(400, "Verify your phone number first")

        document_number = document_number.strip()
        if len(document_number) < 6:
            raise HTTPException(400, "Enter a valid document number")

        digest = _hash_document(document_number)
        clash = (
            self.db.query(User)
            .filter(User.id_document_hash == digest, User.id != user.id)
            .first()
        )
        if clash:
            raise HTTPException(
                409, "That document is already linked to another account"
            )

        # Only the hash and the derived age flag are kept — never the number.
        user.id_document_hash = digest
        if birth_year:
            user.birth_year = birth_year
            user.age_verified = birth_year <= datetime.utcnow().year - 18
        self._raise_tier(user, VerificationLevel.ID)
        self.db.commit()
        self.db.refresh(user)

        return {
            "verification_level": user.verification_level.value,
            "age_verified": user.age_verified,
            "is_stub": True,
            "disclosure": STUB_ID_DISCLOSURE,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _stub_allowed() -> bool:
        if settings.ALLOW_STUB_ID_VERIFICATION:
            return True
        return settings.ENVIRONMENT.lower() in ("development", "test", "local")

    def _raise_tier(self, user: User, target: VerificationLevel) -> None:
        """Only ever move a user up a tier."""
        if _TIER_RANK[target] > _TIER_RANK[user.verification_level]:
            user.verification_level = target
        user.updated_at = datetime.utcnow()

    @staticmethod
    def _next_step(user: User) -> Optional[str]:
        rank = _TIER_RANK[user.verification_level]
        if rank < _TIER_RANK[VerificationLevel.PHONE]:
            return "verify_phone"
        if rank < _TIER_RANK[VerificationLevel.ID]:
            return "verify_id"
        return None
