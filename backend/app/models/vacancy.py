from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Vacancy(Base):
    __tablename__ = "vacancies"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(50))
    search_profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    company_name_raw: Mapped[str] = mapped_column(String(500))
    job_title: Mapped[str] = mapped_column(String(500))
    job_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(20), default="active")
    harvest_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("harvest_runs.id", ondelete="SET NULL"), nullable=True
    )
    extraction_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, completed, failed, skipped
    extraction_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("enrichment_runs.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        Index("ix_vacancy_source_external", "source", "external_id", unique=True),
        Index("ix_vacancy_company_profile", "company_id", "search_profile_id"),
    )
