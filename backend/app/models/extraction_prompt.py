from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExtractionPrompt(Base):
    __tablename__ = "extraction_prompts"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    system_prompt: Mapped[str] = mapped_column(Text)
    extraction_schema: Mapped[dict] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
