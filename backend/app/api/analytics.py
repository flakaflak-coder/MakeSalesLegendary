from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.company import Company
from app.models.harvest import HarvestRun
from app.models.lead import FeedbackLog, Lead
from app.models.profile import SearchProfile, SearchTerm
from app.models.vacancy import Vacancy

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/overview")
async def overview(db: DbSession) -> dict:
    """Overall system statistics across all profiles."""
    # Profiles count
    result = await db.execute(select(func.count(SearchProfile.id)))
    profile_count = result.scalar_one()

    # Companies count
    result = await db.execute(select(func.count(Company.id)))
    company_count = result.scalar_one()

    # Vacancies count and by status
    result = await db.execute(
        select(Vacancy.status, func.count(Vacancy.id)).group_by(Vacancy.status)
    )
    vacancy_by_status = {row[0]: row[1] for row in result.all()}

    # Leads count and by status
    result = await db.execute(
        select(Lead.status, func.count(Lead.id)).group_by(Lead.status)
    )
    lead_by_status = {row[0]: row[1] for row in result.all()}

    # Average scores
    result = await db.execute(
        select(
            func.avg(Lead.composite_score),
            func.avg(Lead.fit_score),
            func.avg(Lead.timing_score),
        )
    )
    scores = result.one()

    # Feedback count by action
    result = await db.execute(
        select(FeedbackLog.action, func.count(FeedbackLog.id)).group_by(
            FeedbackLog.action
        )
    )
    feedback_by_action = {row[0]: row[1] for row in result.all()}

    return {
        "profiles": profile_count,
        "companies": company_count,
        "vacancies": {
            "total": sum(vacancy_by_status.values()),
            "by_status": vacancy_by_status,
        },
        "leads": {
            "total": sum(lead_by_status.values()),
            "by_status": lead_by_status,
            "average_composite_score": round(float(scores[0] or 0), 1),
            "average_fit_score": round(float(scores[1] or 0), 1),
            "average_timing_score": round(float(scores[2] or 0), 1),
        },
        "feedback": feedback_by_action,
    }


@router.get("/funnel")
async def conversion_funnel(
    db: DbSession,
    profile_id: int | None = Query(None),
) -> dict:
    """Conversion funnel for a profile.

    Shows how many entities exist at each pipeline stage:
    vacancies harvested -> companies -> leads -> conversions.
    """
    profile_filter_vacancy = (
        Vacancy.search_profile_id == profile_id if profile_id is not None else True
    )
    profile_filter_lead = (
        Lead.search_profile_id == profile_id if profile_id is not None else True
    )

    # Stage 1: Total vacancies harvested
    result = await db.execute(
        select(func.count(Vacancy.id)).where(profile_filter_vacancy)
    )
    total_vacancies = result.scalar_one()

    # Stage 2: Vacancies with extracted data (LLM enriched)
    result = await db.execute(
        select(func.count(Vacancy.id)).where(
            profile_filter_vacancy,
            Vacancy.extraction_status == "completed",
        )
    )
    enriched_vacancies = result.scalar_one()

    # Stage 3: Unique companies found from vacancies
    result = await db.execute(
        select(func.count(func.distinct(Vacancy.company_id))).where(
            profile_filter_vacancy,
            Vacancy.company_id.isnot(None),
        )
    )
    companies_found = result.scalar_one()

    # Stage 4: Companies that became leads (scored)
    result = await db.execute(select(func.count(Lead.id)).where(profile_filter_lead))
    total_leads = result.scalar_one()

    # Stage 5: Leads with status hot or warm
    result = await db.execute(
        select(func.count(Lead.id)).where(
            profile_filter_lead,
            Lead.status.in_(["hot", "warm"]),
        )
    )
    qualified_leads = result.scalar_one()

    # Stage 6: Leads that have received any feedback
    result = await db.execute(
        select(func.count()).select_from(
            select(func.distinct(FeedbackLog.lead_id))
            .join(Lead, FeedbackLog.lead_id == Lead.id)
            .where(profile_filter_lead)
            .subquery()
        )
    )
    leads_with_feedback = result.scalar_one()

    # Stage 7: Leads marked as converted
    result = await db.execute(
        select(func.count(func.distinct(FeedbackLog.lead_id)))
        .join(Lead, FeedbackLog.lead_id == Lead.id)
        .where(
            profile_filter_lead,
            FeedbackLog.action == "converted",
        )
    )
    converted_leads = result.scalar_one()

    return {
        "profile_id": profile_id,
        "funnel": [
            {"stage": "vacancies_harvested", "count": total_vacancies},
            {"stage": "vacancies_enriched", "count": enriched_vacancies},
            {"stage": "companies_found", "count": companies_found},
            {"stage": "leads_scored", "count": total_leads},
            {"stage": "leads_qualified", "count": qualified_leads},
            {"stage": "leads_contacted", "count": leads_with_feedback},
            {"stage": "leads_converted", "count": converted_leads},
        ],
    }


@router.get("/scoring-accuracy")
async def scoring_accuracy(
    db: DbSession,
    profile_id: int | None = Query(None),
) -> dict:
    """Analyze how well scoring predicts conversion outcomes.

    Compares average scores of converted vs. rejected leads.
    """
    profile_filter = (
        Lead.search_profile_id == profile_id if profile_id is not None else True
    )

    # Get average scores for leads that were converted
    result = await db.execute(
        select(
            func.avg(Lead.composite_score),
            func.avg(Lead.fit_score),
            func.avg(Lead.timing_score),
            func.count(Lead.id),
        )
        .join(FeedbackLog, FeedbackLog.lead_id == Lead.id)
        .where(profile_filter, FeedbackLog.action == "converted")
    )
    converted = result.one()

    # Get average scores for leads that were rejected
    result = await db.execute(
        select(
            func.avg(Lead.composite_score),
            func.avg(Lead.fit_score),
            func.avg(Lead.timing_score),
            func.count(Lead.id),
        )
        .join(FeedbackLog, FeedbackLog.lead_id == Lead.id)
        .where(profile_filter, FeedbackLog.action == "rejected")
    )
    rejected = result.one()

    # Score distribution of all leads in buckets (0-20, 20-40, 40-60, 60-80, 80-100)
    result = await db.execute(
        select(
            case(
                (Lead.composite_score < 20, "0-20"),
                (Lead.composite_score < 40, "20-40"),
                (Lead.composite_score < 60, "40-60"),
                (Lead.composite_score < 80, "60-80"),
                else_="80-100",
            ).label("bucket"),
            func.count(Lead.id),
        )
        .where(profile_filter)
        .group_by("bucket")
    )
    distribution = {row[0]: row[1] for row in result.all()}

    return {
        "profile_id": profile_id,
        "converted": {
            "count": converted[3] or 0,
            "avg_composite_score": round(float(converted[0] or 0), 1),
            "avg_fit_score": round(float(converted[1] or 0), 1),
            "avg_timing_score": round(float(converted[2] or 0), 1),
        },
        "rejected": {
            "count": rejected[3] or 0,
            "avg_composite_score": round(float(rejected[0] or 0), 1),
            "avg_fit_score": round(float(rejected[1] or 0), 1),
            "avg_timing_score": round(float(rejected[2] or 0), 1),
        },
        "score_distribution": distribution,
    }


@router.get("/term-performance")
async def term_performance(
    db: DbSession,
    profile_id: int = Query(...),
) -> dict:
    """Analyze which search terms yield the most and best-scoring leads.

    Requires a profile_id since search terms are profile-specific.
    """
    # Get all search terms for this profile
    result = await db.execute(
        select(SearchTerm).where(SearchTerm.profile_id == profile_id)
    )
    terms = list(result.scalars().all())

    if not terms:
        return {"profile_id": profile_id, "terms": []}

    # Batch query 1: vacancy counts per term using CASE/SUM with GROUP BY
    # We use conditional aggregation — one query for all terms at once.
    vacancy_count_cases = [
        func.sum(
            case(
                (func.lower(Vacancy.job_title).contains(func.lower(term.term)), 1),
                else_=0,
            )
        ).label(f"term_{term.id}")
        for term in terms
    ]
    result = await db.execute(
        select(*vacancy_count_cases).where(
            Vacancy.search_profile_id == profile_id,
        )
    )
    vacancy_counts_row = result.one()
    vacancy_counts = {
        term.id: int(vacancy_counts_row[i] or 0) for i, term in enumerate(terms)
    }

    # Batch query 2: lead scores per term using conditional aggregation
    lead_score_cases = []
    lead_count_cases = []
    for term in terms:
        match_condition = func.lower(Vacancy.job_title).contains(func.lower(term.term))
        lead_score_cases.append(
            func.avg(
                case(
                    (match_condition, Lead.composite_score),
                    else_=None,
                )
            ).label(f"avg_score_{term.id}")
        )
        lead_count_cases.append(
            func.count(
                case(
                    (match_condition, Lead.id),
                    else_=None,
                )
            ).label(f"lead_count_{term.id}")
        )

    result = await db.execute(
        select(*lead_score_cases, *lead_count_cases)
        .select_from(Lead)
        .join(
            Vacancy,
            (Vacancy.company_id == Lead.company_id)
            & (Vacancy.search_profile_id == Lead.search_profile_id),
        )
        .where(Lead.search_profile_id == profile_id)
    )
    lead_row = result.one()
    num_terms = len(terms)
    lead_scores = {
        term.id: round(float(lead_row[i] or 0), 1) for i, term in enumerate(terms)
    }
    lead_counts = {
        term.id: int(lead_row[num_terms + i] or 0) for i, term in enumerate(terms)
    }

    # Merge results in Python
    term_stats: list[dict] = []
    for term in terms:
        term_stats.append(
            {
                "term_id": term.id,
                "term": term.term,
                "language": term.language,
                "priority": term.priority,
                "vacancy_count": vacancy_counts[term.id],
                "lead_count": lead_counts[term.id],
                "avg_lead_score": lead_scores[term.id],
            }
        )

    # Sort by vacancy count descending
    term_stats.sort(key=lambda t: t["vacancy_count"], reverse=True)

    return {"profile_id": profile_id, "terms": term_stats}


@router.get("/harvest-summary")
async def harvest_summary(
    db: DbSession,
    profile_id: int | None = Query(None),
    last_n_runs: int = Query(10, ge=1, le=100),
) -> dict:
    """Summary of recent harvest runs with success rates."""
    query = select(HarvestRun).order_by(HarvestRun.id.desc()).limit(last_n_runs)
    if profile_id is not None:
        query = query.where(HarvestRun.profile_id == profile_id)

    result = await db.execute(query)
    runs = result.scalars().all()

    run_summaries = [
        {
            "id": run.id,
            "profile_id": run.profile_id,
            "source": run.source,
            "status": run.status,
            "vacancies_found": run.vacancies_found,
            "vacancies_new": run.vacancies_new,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }
        for run in runs
    ]

    total_found = sum(r.vacancies_found for r in runs)
    total_new = sum(r.vacancies_new for r in runs)
    completed_runs = [r for r in runs if r.status == "completed"]
    failed_runs = [r for r in runs if r.status == "failed"]

    return {
        "profile_id": profile_id,
        "runs": run_summaries,
        "summary": {
            "total_runs": len(runs),
            "completed": len(completed_runs),
            "failed": len(failed_runs),
            "total_vacancies_found": total_found,
            "total_vacancies_new": total_new,
        },
    }
