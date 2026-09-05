"""
AI-generated social plan for a confirmed meetup — R3 of the PRD.

Matching is only half the product: PRD §7 step 3 requires the app to also answer
"we matched, now what do we actually do for the next hour". This model stores the
generated icebreakers, a short activity plan and a low-barrier mini-game.

Regulatory note (PRD §3, 《人工智能拟人化互动服务管理暂行办法》): the generator is
strictly a **tool** that arranges a real-world meeting. It must not take on a
persona, simulate companionship, or produce emotional/romantic content. That
constraint is enforced in the prompt and in the fallback templates.
"""
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Enum as SAEnum, Integer, JSON, Boolean,
)
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum

from ..core.database import Base


class PlanSource(str, enum.Enum):
    """Whether the plan came from the LLM or the deterministic fallback."""
    LLM = "llm"
    TEMPLATE = "template"


class MeetupPlan(Base):
    __tablename__ = "sm_meetup_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sm_meetup_request_matches.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # --- Context the plan was generated for (denormalised so a plan stays
    #     interpretable even if the request rows change) ---
    venue_name = Column(String(128), nullable=True)
    venue_type = Column(String(32), nullable=True)
    scene = Column(String(32), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    party_size = Column(Integer, nullable=True)

    # --- Generated content ---
    icebreakers = Column(JSON, default=list, nullable=False)   # list[str]
    itinerary = Column(JSON, default=list, nullable=False)     # list[{minute, title, detail}]
    mini_game = Column(JSON, default=dict, nullable=False)     # {name, how_to_play}
    shared_interests = Column(JSON, default=list, nullable=False)

    source = Column(SAEnum(PlanSource), default=PlanSource.TEMPLATE, nullable=False)
    # Adoption tracking — PRD action item 6 wants 方案采纳率 measured, which needs a
    # per-plan flag rather than an inferred metric.
    adopted = Column(Boolean, default=False, nullable=False)
    adopted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
