from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SearchProfile(Base):
    __tablename__ = "search_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    search_terms: Mapped[list["SearchTerm"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class SearchTerm(Base):
    __tablename__ = "search_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    term: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(10), default="nl")
    priority: Mapped[str] = mapped_column(String(20), default="primary")
    category: Mapped[str] = mapped_column(String(50), default="job_title")

    profile: Mapped["SearchProfile"] = relationship(back_populates="search_terms")
