"""Observatory API — aggregated system health, pipeline metrics, and data quality."""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.company import Company
from app.models.enrichment import EnrichmentRun
from app.models.event import EventLog
from app.models.harvest import HarvestRun
from app.models.lead import FeedbackLog, Lead
from app.models.profile import SearchProfile, SearchTerm
from app.models.vacancy import Vacancy

router = APIRouter(prefix="/api/observatory", tags=["observatory"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def observatory(db: DbSession) -> dict:
    """Full observatory snapshot: system stats, pipeline health, data quality."""

    now = datetime.now(UTC)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)
    last_30d = now - timedelta(days=30)

    # ── Entity counts ───────────────────────────────────────────
    profile_count = (
        await db.execute(select(func.count(SearchProfile.id)))
    ).scalar_one()
    term_count = (await db.execute(select(func.count(SearchTerm.id)))).scalar_one()
    company_count = (await db.execute(select(func.count(Company.id)))).scalar_one()
    vacancy_count = (await db.execute(select(func.count(Vacancy.id)))).scalar_one()
    lead_count = (await db.execute(select(func.count(Lead.id)))).scalar_one()

    # Vacancy status breakdown
    vac_status_rows = (
        await db.execute(
            select(Vacancy.status, func.count(Vacancy.id)).group_by(Vacancy.status)
        )
    ).all()
    vacancy_by_status = {row[0]: row[1] for row in vac_status_rows}

    # Lead status breakdown
    lead_status_rows = (
        await db.execute(select(Lead.status, func.count(Lead.id)).group_by(Lead.status))
    ).all()
    lead_by_status = {row[0]: row[1] for row in lead_status_rows}

    # ── Pipeline health: Harvest ────────────────────────────────
    harvest_24h_rows = (
        await db.execute(
            select(HarvestRun.status, func.count(HarvestRun.id))
            .where(HarvestRun.started_at >= last_24h)
            .group_by(HarvestRun.status)
        )
    ).all()
    harvest_24h = {row[0]: row[1] for row in harvest_24h_rows}

    harvest_7d_rows = (
        await db.execute(
            select(HarvestRun.status, func.count(HarvestRun.id))
            .where(HarvestRun.started_at >= last_7d)
            .group_by(HarvestRun.status)
        )
    ).all()
    harvest_7d = {row[0]: row[1] for row in harvest_7d_rows}

    harvest_7d_vacancies = (
        await db.execute(
            select(
                func.coalesce(func.sum(HarvestRun.vacancies_found), 0),
                func.coalesce(func.sum(HarvestRun.vacancies_new), 0),
            ).where(HarvestRun.started_at >= last_7d)
        )
    ).one()

    last_harvest = (
        await db.execute(
            select(
                HarvestRun.id,
                HarvestRun.status,
                HarvestRun.started_at,
                HarvestRun.completed_at,
                HarvestRun.vacancies_found,
                HarvestRun.vacancies_new,
                HarvestRun.error_message,
            )
            .order_by(HarvestRun.id.desc())
            .limit(1)
        )
    ).first()

    # ── Pipeline health: Enrichment ─────────────────────────────
    enrichment_7d_rows = (
        await db.execute(
            select(
                EnrichmentRun.pass_type,
                EnrichmentRun.status,
                func.count(EnrichmentRun.id),
                func.coalesce(func.sum(EnrichmentRun.items_processed), 0),
                func.coalesce(func.sum(EnrichmentRun.items_succeeded), 0),
                func.coalesce(func.sum(EnrichmentRun.items_failed), 0),
            )
            .where(EnrichmentRun.started_at >= last_7d)
            .group_by(EnrichmentRun.pass_type, EnrichmentRun.status)
        )
    ).all()

    enrichment_summary: dict[str, dict] = {}
    for row in enrichment_7d_rows:
        pass_type = row[0]
        if pass_type not in enrichment_summary:
            enrichment_summary[pass_type] = {
                "runs": 0,
                "completed": 0,
                "failed": 0,
                "items_processed": 0,
                "items_succeeded": 0,
                "items_failed": 0,
            }
        entry = enrichment_summary[pass_type]
        entry["runs"] += row[2]
        if row[1] == "completed":
            entry["completed"] += row[2]
        elif row[1] == "failed":
            entry["failed"] += row[2]
        entry["items_processed"] += int(row[3])
        entry["items_succeeded"] += int(row[4])
        entry["items_failed"] += int(row[5])

    # LLM token usage (last 7d and 30d)
    tokens_7d = (
        await db.execute(
            select(
                func.coalesce(func.sum(EnrichmentRun.tokens_input), 0),
                func.coalesce(func.sum(EnrichmentRun.tokens_output), 0),
            ).where(
                EnrichmentRun.started_at >= last_7d,
                EnrichmentRun.pass_type == "llm",
            )
        )
    ).one()

    tokens_30d = (
        await db.execute(
            select(
                func.coalesce(func.sum(EnrichmentRun.tokens_input), 0),
                func.coalesce(func.sum(EnrichmentRun.tokens_output), 0),
            ).where(
                EnrichmentRun.started_at >= last_30d,
                EnrichmentRun.pass_type == "llm",
            )
        )
    ).one()

    # ── Data quality ────────────────────────────────────────────
    # Company enrichment status breakdown
    enrichment_status_rows = (
        await db.execute(
            select(Company.enrichment_status, func.count(Company.id)).group_by(
                Company.enrichment_status
            )
        )
    ).all()
    enrichment_by_status = {
        (row[0] or "unknown"): row[1] for row in enrichment_status_rows
    }

    # Average extraction quality
    avg_quality = (
        await db.execute(
            select(
                func.avg(Company.extraction_quality),
                func.count(Company.id),
            ).where(Company.extraction_quality.isnot(None))
        )
    ).one()

    # Vacancy extraction status breakdown
    extraction_status_rows = (
        await db.execute(
            select(Vacancy.extraction_status, func.count(Vacancy.id)).group_by(
                Vacancy.extraction_status
            )
        )
    ).all()
    extraction_by_status = {
        (row[0] or "pending"): row[1] for row in extraction_status_rows
    }

    # Companies with KvK numbers
    kvk_count = (
        await db.execute(
            select(func.count(Company.id)).where(Company.kvk_number.isnot(None))
        )
    ).scalar_one()

    # ── Recent activity (last 20 events) ────────────────────────
    recent_events = (
        await db.execute(
            select(
                EventLog.id,
                EventLog.event_type,
                EventLog.entity_type,
                EventLog.entity_id,
                EventLog.event_metadata,
                EventLog.created_at,
            )
            .order_by(EventLog.created_at.desc())
            .limit(20)
        )
    ).all()

    # Event counts by type (last 24h)
    event_type_rows = (
        await db.execute(
            select(EventLog.event_type, func.count(EventLog.id))
            .where(EventLog.created_at >= last_24h)
            .group_by(EventLog.event_type)
        )
    ).all()
    events_24h = {row[0]: row[1] for row in event_type_rows}

    # ── Feedback summary ────────────────────────────────────────
    feedback_rows = (
        await db.execute(
            select(FeedbackLog.action, func.count(FeedbackLog.id)).group_by(
                FeedbackLog.action
            )
        )
    ).all()
    feedback_by_action = {row[0]: row[1] for row in feedback_rows}

    # ── Scoring health ──────────────────────────────────────────
    score_stats = (
        await db.execute(
            select(
                func.avg(Lead.composite_score),
                func.min(Lead.composite_score),
                func.max(Lead.composite_score),
                func.avg(Lead.fit_score),
                func.avg(Lead.timing_score),
            )
        )
    ).one()

    # Leads scored in last 7d
    recently_scored = (
        await db.execute(select(func.count(Lead.id)).where(Lead.scored_at >= last_7d))
    ).scalar_one()

    # ── Build response ──────────────────────────────────────────
    return {
        "generated_at": now.isoformat(),
        "entities": {
            "profiles": profile_count,
            "search_terms": term_count,
            "companies": company_count,
            "vacancies": {
                "total": vacancy_count,
                "by_status": vacancy_by_status,
            },
            "leads": {
                "total": lead_count,
                "by_status": lead_by_status,
            },
        },
        "pipeline": {
            "harvest": {
                "last_24h": harvest_24h,
                "last_7d": {
                    "by_status": harvest_7d,
                    "vacancies_found": int(harvest_7d_vacancies[0]),
                    "vacancies_new": int(harvest_7d_vacancies[1]),
                },
                "last_run": (
                    {
                        "id": last_harvest[0],
                        "status": last_harvest[1],
                        "started_at": (
                            last_harvest[2].isoformat() if last_harvest[2] else None
                        ),
                        "completed_at": (
                            last_harvest[3].isoformat() if last_harvest[3] else None
                        ),
                        "vacancies_found": last_harvest[4],
                        "vacancies_new": last_harvest[5],
                        "error_message": last_harvest[6],
                    }
                    if last_harvest
                    else None
                ),
            },
            "enrichment": {
                "last_7d": enrichment_summary,
            },
            "llm": {
                "tokens_7d": {
                    "input": int(tokens_7d[0]),
                    "output": int(tokens_7d[1]),
                    "total": int(tokens_7d[0]) + int(tokens_7d[1]),
                },
                "tokens_30d": {
                    "input": int(tokens_30d[0]),
                    "output": int(tokens_30d[1]),
                    "total": int(tokens_30d[0]) + int(tokens_30d[1]),
                },
            },
        },
        "data_quality": {
            "company_enrichment": enrichment_by_status,
            "extraction_quality": {
                "average": round(float(avg_quality[0] or 0), 3),
                "companies_with_score": avg_quality[1],
            },
            "vacancy_extraction": extraction_by_status,
            "kvk_coverage": {
                "with_kvk": kvk_count,
                "total": company_count,
                "percentage": (
                    round(kvk_count / company_count * 100, 1) if company_count else 0
                ),
            },
        },
        "scoring": {
            "avg_composite": round(float(score_stats[0] or 0), 1),
            "min_composite": round(float(score_stats[1] or 0), 1),
            "max_composite": round(float(score_stats[2] or 0), 1),
            "avg_fit": round(float(score_stats[3] or 0), 1),
            "avg_timing": round(float(score_stats[4] or 0), 1),
            "recently_scored_7d": recently_scored,
        },
        "feedback": feedback_by_action,
        "recent_events": [
            {
                "id": e[0],
                "event_type": e[1],
                "entity_type": e[2],
                "entity_id": e[3],
                "metadata": e[4],
                "created_at": e[5].isoformat() if e[5] else None,
            }
            for e in recent_events
        ],
        "events_24h": events_24h,
    }
