"""Attestation beat tasks — route stale check-ins to arbitration.

Replaces the previous auto-slash task. PRD §7 step 7 is explicit that a one-sided
check-in must not be treated as proof of a no-show, so nothing here penalises a
user: expired attestations either lapse (nobody showed) or move to
``pending_arbitration`` (one side showed) with the deposits frozen for review.
"""
import logging
from datetime import datetime

from .celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.attestation_tasks.route_expired_attestations", bind=True
)
def route_expired_attestations(self) -> dict:
    """Runs hourly. Classifies attestations whose window has closed.

    - Neither side confirmed → ``expired``; the deposits are released, since
      there is no evidence against either person.
    - Exactly one side confirmed → ``pending_arbitration``; deposits are frozen
      and a human resolves it.
    """
    from app.core.database import SessionLocal
    from app.models.attestation import AttestationStatus, MeetupAttestation
    from app.services.meetup_attestation_service import MeetupAttestationService
    from app.services.stake_service import StakeService

    to_arbitration = 0
    lapsed = 0
    errors = 0

    with SessionLocal() as db:
        now = datetime.utcnow()
        stale = (
            db.query(MeetupAttestation)
            .filter(
                MeetupAttestation.expires_at < now,
                MeetupAttestation.status.in_(
                    [
                        AttestationStatus.INITIATED,
                        AttestationStatus.PENDING_CONFIRM,
                    ]
                ),
            )
            .all()
        )
        logger.info("route_expired_attestations: %d stale attestations", len(stale))

        att_svc = MeetupAttestationService(db)
        stake_svc = StakeService(db)

        for attestation in stale:
            try:
                confirmations = sum(
                    [
                        bool(attestation.initiator_confirmed),
                        bool(attestation.counterparty_confirmed),
                    ]
                )
                if confirmations == 1:
                    att_svc.mark_pending_arbitration(
                        attestation,
                        "One party checked in before the window closed. Held for "
                        "review — a one-sided check-in is not treated as a no-show.",
                    )
                    to_arbitration += 1
                else:
                    # Nobody checked in. There is no basis to penalise either
                    # side, so the deposits go back.
                    attestation.status = AttestationStatus.EXPIRED
                    db.commit()
                    if attestation.meetup_match_id:
                        stake_svc.refund_for_match(attestation.meetup_match_id)
                    lapsed += 1
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "Failed to route attestation %s: %s",
                    attestation.id,
                    exc,
                    exc_info=True,
                )
                errors += 1

    result = {
        "pending_arbitration": to_arbitration,
        "expired": lapsed,
        "errors": errors,
        "ran_at": datetime.utcnow().isoformat(),
    }
    logger.info("route_expired_attestations complete: %s", result)
    return result
