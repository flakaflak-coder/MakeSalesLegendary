from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE")
    )
    search_profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    fit_score: Mapped[float] = mapped_column(Float, default=0.0)
    timing_score: Mapped[float] = mapped_column(Float, default=0.0)
    composite_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(
        String(20), default="monitor"
    )  # hot, warm, monitor, dismissed
    scoring_breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    vacancy_count: Mapped[int] = mapped_column(Integer, default=0)
    oldest_vacancy_days: Mapped[int] = mapped_column(Integer, default=0)
    platform_count: Mapped[int] = mapped_column(Integer, default=0)
    scored_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index(
            "ix_lead_company_profile",
            "company_id",
            "search_profile_id",
            unique=True,
        ),
        Index("ix_lead_status", "status"),
        Index("ix_lead_composite_score", "composite_score"),
    )


class ScoringConfig(Base):
    __tablename__ = "scoring_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(default=True)
    fit_weight: Mapped[float] = mapped_column(Float, default=0.6)
    timing_weight: Mapped[float] = mapped_column(Float, default=0.4)
    fit_criteria: Mapped[dict] = mapped_column(JSONB, default=dict)
    timing_signals: Mapped[dict] = mapped_column(JSONB, default=dict)
    score_thresholds: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {"hot": 75, "warm": 50, "monitor": 25},
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_scoring_config_profile_active", "profile_id", "is_active"),
    )


class FeedbackLog(Base):
    __tablename__ = "feedback_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(
        String(50)
    )  # contacted, meeting, converted, rejected
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    scoring_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
