from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.company import Company
from app.models.lead import FeedbackLog, Lead
from app.models.vacancy import Vacancy
from app.schemas.lead import (
    FeedbackCreate,
    FeedbackResponse,
    LeadDetailResponse,
    LeadListResponse,
)
from app.services.event_log import log_event

router = APIRouter(prefix="/api/leads", tags=["leads"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

VALID_STATUSES = {"hot", "warm", "monitor", "dismissed", "excluded"}
VALID_SORT_COLUMNS = {"composite_score", "fit_score", "timing_score", "created_at"}


@router.get("", response_model=list[LeadListResponse])
async def list_leads(
    db: DbSession,
    profile_id: int | None = Query(None),
    status: str | None = Query(None),
    min_score: float | None = Query(None, ge=0, le=100),
    max_score: float | None = Query(None, ge=0, le=100),
    sort_by: str = Query("composite_score"),
    sort_order: str = Query("desc"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    """List leads with filtering and sorting."""
    query = select(
        Lead,
        Company.name.label("company_name"),
        Company.employee_range.label("company_employee_range"),
        Company.sbi_codes.label("company_sbi_codes"),
        Company.enrichment_status.label("company_enrichment_status"),
        Company.extraction_quality.label("company_extraction_quality"),
    ).join(Company, Lead.company_id == Company.id)

    if profile_id is not None:
        query = query.where(Lead.search_profile_id == profile_id)
    if status is not None:
        query = query.where(Lead.status == status)
    else:
        # By default, hide excluded leads — they're below minimum company size
        query = query.where(Lead.status != "excluded")
    if min_score is not None:
        query = query.where(Lead.composite_score >= min_score)
    if max_score is not None:
        query = query.where(Lead.composite_score <= max_score)

    # Validate and apply sorting
    if sort_by not in VALID_SORT_COLUMNS:
        sort_by = "composite_score"
    sort_column = getattr(Lead, sort_by)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    rows = result.all()

    leads: list[dict] = []
    for row in rows:
        lead: Lead = row[0]

        # Extract ERP from scoring breakdown if available
        erp = None
        if lead.scoring_breakdown:
            fit = lead.scoring_breakdown.get("fit", {})
            erp_info = fit.get("breakdown", {}).get("erp_compatibility", {})
            erp_value = erp_info.get("value")
            if erp_value and erp_value != "unknown":
                erp = erp_value

        leads.append(
            {
                "id": lead.id,
                "company_id": lead.company_id,
                "search_profile_id": lead.search_profile_id,
                "fit_score": lead.fit_score,
                "timing_score": lead.timing_score,
                "composite_score": lead.composite_score,
                "status": lead.status,
                "vacancy_count": lead.vacancy_count,
                "oldest_vacancy_days": lead.oldest_vacancy_days,
                "platform_count": lead.platform_count,
                "company_name": row.company_name,
                "company_city": None,
                "company_sector": None,
                "company_employee_range": row.company_employee_range,
                "company_erp": erp,
                "company_enrichment_status": row.company_enrichment_status,
                "company_extraction_quality": row.company_extraction_quality,
            }
        )

    return leads


@router.get("/stats")
async def lead_stats(
    db: DbSession,
    profile_id: int | None = Query(None),
) -> dict:
    """Get aggregate lead statistics, optionally filtered by profile."""
    base_filter = (
        Lead.search_profile_id == profile_id if profile_id is not None else True
    )

    # Count by status
    result = await db.execute(
        select(Lead.status, func.count(Lead.id))
        .where(base_filter)
        .group_by(Lead.status)
    )
    status_counts = {row[0]: row[1] for row in result.all()}

    # Total and average score
    result = await db.execute(
        select(func.count(Lead.id), func.avg(Lead.composite_score)).where(base_filter)
    )
    agg = result.one()

    return {
        "total": agg[0] or 0,
        "average_score": round(float(agg[1] or 0), 1),
        "by_status": status_counts,
    }


@router.get("/{lead_id}", response_model=LeadDetailResponse)
async def get_lead(lead_id: int, db: DbSession) -> dict:
    """Get detailed lead information including company, vacancies, and feedback."""
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")

    # Get company
    result = await db.execute(select(Company).where(Company.id == lead.company_id))
    company = result.scalar_one_or_none()

    # Get vacancies linked to same company + profile
    result = await db.execute(
        select(Vacancy)
        .where(
            Vacancy.company_id == lead.company_id,
            Vacancy.search_profile_id == lead.search_profile_id,
        )
        .order_by(Vacancy.first_seen_at.desc())
    )
    vacancies = result.scalars().all()

    # Get feedback history
    result = await db.execute(
        select(FeedbackLog)
        .where(FeedbackLog.lead_id == lead.id)
        .order_by(FeedbackLog.created_at.desc())
    )
    feedback_items = result.scalars().all()

    return {
        "id": lead.id,
        "company_id": lead.company_id,
        "search_profile_id": lead.search_profile_id,
        "fit_score": lead.fit_score,
        "timing_score": lead.timing_score,
        "composite_score": lead.composite_score,
        "status": lead.status,
        "scoring_breakdown": lead.scoring_breakdown,
        "vacancy_count": lead.vacancy_count,
        "oldest_vacancy_days": lead.oldest_vacancy_days,
        "platform_count": lead.platform_count,
        "scored_at": lead.scored_at,
        "created_at": lead.created_at,
        "company": {
            "id": company.id,
            "name": company.name,
            "kvk_number": company.kvk_number,
            "sbi_codes": company.sbi_codes,
            "employee_range": company.employee_range,
            "revenue_range": company.revenue_range,
            "entity_count": company.entity_count,
            "enrichment_data": company.enrichment_data,
            "enrichment_status": company.enrichment_status,
            "extraction_quality": company.extraction_quality,
        }
        if company
        else None,
        "vacancies": [
            {
                "id": v.id,
                "job_title": v.job_title,
                "source": v.source,
                "location": v.location,
                "status": v.status,
                "first_seen_at": v.first_seen_at.isoformat()
                if v.first_seen_at
                else None,
                "last_seen_at": v.last_seen_at.isoformat() if v.last_seen_at else None,
                "extracted_data": v.extracted_data,
            }
            for v in vacancies
        ],
        "feedback": [
            {
                "id": f.id,
                "action": f.action,
                "reason": f.reason,
                "notes": f.notes,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in feedback_items
        ],
    }


@router.put("/{lead_id}/status")
async def update_lead_status(
    lead_id: int,
    db: DbSession,
    status: str = Query(...),
) -> dict:
    """Update lead status (hot, warm, monitor, dismissed)."""
    if status not in VALID_STATUSES:
        allowed = ", ".join(sorted(VALID_STATUSES))
        raise HTTPException(
            400, f"Invalid status '{status}'. Must be one of: {allowed}"
        )

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")

    lead.status = status
    log_event(
        db,
        event_type="lead.status_updated",
        entity_type="lead",
        entity_id=lead.id,
        metadata={"status": status},
    )
    await db.commit()
    return {"id": lead.id, "status": lead.status}


@router.post("/{lead_id}/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(
    lead_id: int,
    body: FeedbackCreate,
    db: DbSession,
) -> FeedbackLog:
    """Submit feedback on a lead (contacted, meeting, converted, rejected)."""
    valid_actions = {"contacted", "meeting", "converted", "rejected"}
    if body.action not in valid_actions:
        allowed = ", ".join(sorted(valid_actions))
        raise HTTPException(
            400,
            f"Invalid action '{body.action}'. Must be one of: {allowed}",
        )

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")

    feedback = FeedbackLog(
        lead_id=lead.id,
        action=body.action,
        reason=body.reason,
        notes=body.notes,
        scoring_snapshot={
            "fit_score": lead.fit_score,
            "timing_score": lead.timing_score,
            "composite_score": lead.composite_score,
            "status": lead.status,
        },
    )
    db.add(feedback)
    log_event(
        db,
        event_type="lead.feedback_submitted",
        entity_type="lead",
        entity_id=lead.id,
        metadata={"action": body.action},
    )
    await db.commit()
    await db.refresh(feedback)
    return feedback
