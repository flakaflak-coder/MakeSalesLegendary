from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    kvk_number: Mapped[str | None] = mapped_column(
        String(20), unique=True, nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(500))
    normalized_name: Mapped[str] = mapped_column(String(500), index=True)
    sbi_codes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    employee_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    revenue_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_count: Mapped[int | None] = mapped_column(nullable=True)
    enrichment_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    enriched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
