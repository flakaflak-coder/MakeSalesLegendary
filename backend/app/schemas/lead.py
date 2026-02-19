from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    search_profile_id: int
    fit_score: float
    timing_score: float
    composite_score: float
    status: str
    scoring_breakdown: dict | None
    vacancy_count: int
    oldest_vacancy_days: int
    platform_count: int
    scored_at: datetime | None
    created_at: datetime


class LeadListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    search_profile_id: int
    fit_score: float
    timing_score: float
    composite_score: float
    status: str
    vacancy_count: int
    oldest_vacancy_days: int
    platform_count: int
    # Denormalized company fields for list view
    company_name: str | None = None
    company_city: str | None = None
    company_sector: str | None = None
    company_employee_range: str | None = None
    company_erp: str | None = None
    company_enrichment_status: str | None = None
    company_extraction_quality: float | None = None


class LeadDetailResponse(LeadResponse):
    company: dict | None = None
    vacancies: list[dict] = []
    feedback: list[dict] = []


class FeedbackCreate(BaseModel):
    action: str
    reason: str | None = None
    notes: str | None = None


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lead_id: int
    action: str
    reason: str | None
    notes: str | None
    created_at: datetime


class ScoringConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    version: int
    is_active: bool
    fit_weight: float
    timing_weight: float
    fit_criteria: dict
    timing_signals: dict
    score_thresholds: dict


class ScoringConfigUpdate(BaseModel):
    fit_weight: float | None = None
    timing_weight: float | None = None
    fit_criteria: dict | None = None
    timing_signals: dict | None = None
    score_thresholds: dict | None = None
