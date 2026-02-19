from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SearchTermCreate(BaseModel):
    term: str
    language: str = "nl"
    priority: str = "primary"
    category: str = "job_title"


class SearchTermResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    term: str
    language: str
    priority: str
    category: str


class ProfileCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    search_terms: list[SearchTermCreate] = []


class ProfileUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    search_terms: list[SearchTermCreate] | None = None


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None
    search_terms: list[SearchTermResponse]
    created_at: datetime
    updated_at: datetime
