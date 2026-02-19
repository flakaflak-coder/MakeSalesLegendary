import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.harvest import HarvestRun
from app.models.lead import FeedbackLog, Lead
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool definitions (Claude tool_use JSON schema)
# ---------------------------------------------------------------------------

CHAT_TOOLS: list[dict] = [
    {
        "name": "get_profiles",
        "description": (
            "List all available search profiles. Returns profile id, name, slug."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_leads",
        "description": (
            "List leads with optional filters. Returns "
            "company name, score, status, vacancy count."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "profile_id": {
                    "type": "integer",
                    "description": "Filter by search profile ID",
                },
                "status": {
                    "type": "string",
                    "enum": ["hot", "warm", "monitor", "dismissed"],
                    "description": "Filter by lead status",
                },
                "min_score": {
                    "type": "number",
                    "description": "Minimum composite score (0-100)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 10)",
                },
                "sort_by": {
                    "type": "string",
                    "enum": [
                        "composite_score",
                        "fit_score",
                        "timing_score",
                        "created_at",
                    ],
                    "description": "Sort field (default composite_score)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "search_leads_by_company",
        "description": (
            "Search for leads by company name (partial match, case-insensitive)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "company_name": {
                    "type": "string",
                    "description": "Company name to search for",
                },
            },
            "required": ["company_name"],
        },
    },
    {
        "name": "get_lead_detail",
        "description": (
            "Get full details for a specific lead: "
            "company, vacancies, feedback, scoring."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "integer", "description": "The lead ID"},
            },
            "required": ["lead_id"],
        },
    },
    {
        "name": "get_lead_stats",
        "description": (
            "Get aggregate lead statistics: total, average score, breakdown by status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "profile_id": {
                    "type": "integer",
                    "description": "Filter by profile ID (optional)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "trigger_harvest",
        "description": (
            "Start a harvest run to scrape job vacancies. Queues a background job."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "profile_id": {
                    "type": "integer",
                    "description": "Profile ID to harvest for",
                },
                "source": {
                    "type": "string",
                    "enum": ["google_jobs", "indeed"],
                    "description": "Scraping source (default google_jobs)",
                },
            },
            "required": ["profile_id"],
        },
    },
    {
        "name": "trigger_enrichment",
        "description": (
            "Start enrichment for a profile. Extracts data from vacancy texts via LLM."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "profile_id": {
                    "type": "integer",
                    "description": "Profile ID to enrich",
                },
                "pass_type": {
                    "type": "string",
                    "enum": ["llm", "external", "both"],
                    "description": "Which enrichment pass to run (default both)",
                },
            },
            "required": ["profile_id"],
        },
    },
    {
        "name": "run_scoring",
        "description": (
            "Recalculate scores for all leads in a profile using current config."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "profile_id": {"type": "integer", "description": "Profile ID to score"},
            },
            "required": ["profile_id"],
        },
    },
    {
        "name": "update_lead_status",
        "description": (
            "Update a lead's status. Use to promote, "
            "dismiss, or change lead pipeline stage."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {
                    "type": "integer",
                    "description": "The lead ID to update",
                },
                "status": {
                    "type": "string",
                    "enum": [
                        "hot",
                        "warm",
                        "monitor",
                        "dismissed",
                    ],
                    "description": "New status for the lead",
                },
            },
            "required": ["lead_id", "status"],
        },
    },
    {
        "name": "get_analytics_overview",
        "description": (
            "Get system-wide statistics: profiles, companies, vacancies, leads, scores."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_harvest_summary",
        "description": (
            "Get summary of recent harvest runs: "
            "success/failure counts, vacancies found."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "profile_id": {
                    "type": "integer",
                    "description": "Filter by profile ID (optional)",
                },
                "last_n_runs": {
                    "type": "integer",
                    "description": "Number of recent runs to summarize (default 10)",
                },
            },
            "required": [],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool handlers — execute against the database
# ---------------------------------------------------------------------------


async def handle_tool_call(
    tool_name: str,
    tool_input: dict,
    db: AsyncSession,
) -> dict:
    """Dispatch a tool call to the appropriate handler."""
    handlers = {
        "get_profiles": _handle_get_profiles,
        "get_leads": _handle_get_leads,
        "search_leads_by_company": _handle_search_leads_by_company,
        "get_lead_detail": _handle_get_lead_detail,
        "get_lead_stats": _handle_get_lead_stats,
        "trigger_harvest": _handle_trigger_harvest,
        "trigger_enrichment": _handle_trigger_enrichment,
        "run_scoring": _handle_run_scoring,
        "update_lead_status": _handle_update_lead_status,
        "get_analytics_overview": _handle_get_analytics_overview,
        "get_harvest_summary": _handle_get_harvest_summary,
    }
    handler = handlers.get(tool_name)
    if not handler:
        return {"error": f"Unknown tool: {tool_name}"}
    try:
        return await handler(tool_input, db)
    except Exception as exc:
        logger.exception("Tool handler error: %s", tool_name)
        return {"error": str(exc)}


async def _handle_get_profiles(_input: dict, db: AsyncSession) -> dict:
    result = await db.execute(select(SearchProfile).order_by(SearchProfile.id))
    profiles = result.scalars().all()
    return {
        "profiles": [
            {
                "id": p.id,
                "name": p.name,
                "slug": p.slug,
                "description": p.description,
            }
            for p in profiles
        ]
    }


async def _handle_get_leads(tool_input: dict, db: AsyncSession) -> dict:
    profile_id = tool_input.get("profile_id")
    status = tool_input.get("status")
    min_score = tool_input.get("min_score")
    limit = tool_input.get("limit", 10)
    sort_by = tool_input.get("sort_by", "composite_score")

    query = select(
        Lead,
        Company.name.label("company_name"),
        Company.employee_range.label("employee_range"),
    ).join(Company, Lead.company_id == Company.id)

    if profile_id is not None:
        query = query.where(Lead.search_profile_id == profile_id)
    if status is not None:
        query = query.where(Lead.status == status)
    else:
        query = query.where(Lead.status != "excluded")
    if min_score is not None:
        query = query.where(Lead.composite_score >= min_score)

    valid_sorts = {"composite_score", "fit_score", "timing_score", "created_at"}
    if sort_by not in valid_sorts:
        sort_by = "composite_score"
    query = query.order_by(getattr(Lead, sort_by).desc()).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return {
        "leads": [
            {
                "id": row[0].id,
                "company_name": row.company_name,
                "composite_score": row[0].composite_score,
                "fit_score": row[0].fit_score,
                "timing_score": row[0].timing_score,
                "status": row[0].status,
                "vacancy_count": row[0].vacancy_count,
                "employee_range": row.employee_range,
            }
            for row in rows
        ],
        "count": len(rows),
    }


async def _handle_search_leads_by_company(tool_input: dict, db: AsyncSession) -> dict:
    name = tool_input["company_name"]
    query = (
        select(
            Lead,
            Company.name.label("company_name"),
        )
        .join(Company, Lead.company_id == Company.id)
        .where(func.lower(Company.name).contains(func.lower(name)))
        .where(Lead.status != "excluded")
        .order_by(Lead.composite_score.desc())
        .limit(10)
    )
    result = await db.execute(query)
    rows = result.all()
    return {
        "leads": [
            {
                "id": row[0].id,
                "company_name": row.company_name,
                "composite_score": row[0].composite_score,
                "status": row[0].status,
                "vacancy_count": row[0].vacancy_count,
            }
            for row in rows
        ],
        "count": len(rows),
    }


async def _handle_get_lead_detail(tool_input: dict, db: AsyncSession) -> dict:
    lead_id = tool_input["lead_id"]
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        return {"error": f"Lead {lead_id} not found"}

    result = await db.execute(select(Company).where(Company.id == lead.company_id))
    company = result.scalar_one_or_none()

    result = await db.execute(
        select(Vacancy)
        .where(
            Vacancy.company_id == lead.company_id,
            Vacancy.search_profile_id == lead.search_profile_id,
        )
        .order_by(Vacancy.first_seen_at.desc())
    )
    vacancies = result.scalars().all()

    result = await db.execute(
        select(FeedbackLog)
        .where(FeedbackLog.lead_id == lead.id)
        .order_by(FeedbackLog.created_at.desc())
    )
    feedback_items = result.scalars().all()

    return {
        "lead": {
            "id": lead.id,
            "composite_score": lead.composite_score,
            "fit_score": lead.fit_score,
            "timing_score": lead.timing_score,
            "status": lead.status,
            "vacancy_count": lead.vacancy_count,
            "oldest_vacancy_days": lead.oldest_vacancy_days,
            "platform_count": lead.platform_count,
            "scoring_breakdown": lead.scoring_breakdown,
        },
        "company": {
            "name": company.name if company else "Unknown",
            "kvk_number": company.kvk_number if company else None,
            "employee_range": company.employee_range if company else None,
            "revenue_range": company.revenue_range if company else None,
            "entity_count": company.entity_count if company else None,
            "sbi_codes": company.sbi_codes if company else None,
        },
        "vacancies": [
            {
                "job_title": v.job_title,
                "source": v.source,
                "location": v.location,
                "status": v.status,
                "first_seen_at": v.first_seen_at.isoformat()
                if v.first_seen_at
                else None,
            }
            for v in vacancies
        ],
        "feedback": [
            {
                "action": f.action,
                "reason": f.reason,
                "notes": f.notes,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in feedback_items
        ],
    }


async def _handle_get_lead_stats(tool_input: dict, db: AsyncSession) -> dict:
    profile_id = tool_input.get("profile_id")
    base_filter = (
        Lead.search_profile_id == profile_id if profile_id is not None else True
    )

    result = await db.execute(
        select(Lead.status, func.count(Lead.id))
        .where(base_filter)
        .group_by(Lead.status)
    )
    status_counts = {row[0]: row[1] for row in result.all()}

    result = await db.execute(
        select(func.count(Lead.id), func.avg(Lead.composite_score)).where(base_filter)
    )
    agg = result.one()

    return {
        "total": agg[0] or 0,
        "average_score": round(float(agg[1] or 0), 1),
        "by_status": status_counts,
    }


async def _handle_trigger_harvest(tool_input: dict, db: AsyncSession) -> dict:
    from app.worker import trigger_harvest_task

    profile_id = tool_input["profile_id"]
    source = tool_input.get("source", "google_jobs")
    task = trigger_harvest_task.delay(profile_id, source)
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": profile_id,
        "source": source,
    }


async def _handle_trigger_enrichment(tool_input: dict, db: AsyncSession) -> dict:
    from app.worker import trigger_enrichment_task

    profile_id = tool_input["profile_id"]
    pass_type = tool_input.get("pass_type", "both")
    task = trigger_enrichment_task.delay(profile_id, pass_type)
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": profile_id,
        "pass_type": pass_type,
    }


async def _handle_run_scoring(tool_input: dict, db: AsyncSession) -> dict:
    from app.worker import trigger_scoring_task

    profile_id = tool_input["profile_id"]
    task = trigger_scoring_task.delay(profile_id)
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": profile_id,
    }


async def _handle_update_lead_status(tool_input: dict, db: AsyncSession) -> dict:
    lead_id = tool_input["lead_id"]
    status = tool_input["status"]
    valid = {"hot", "warm", "monitor", "dismissed"}
    if status not in valid:
        return {"error": f"Invalid status: {status}"}

    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        return {"error": f"Lead {lead_id} not found"}

    old_status = lead.status
    lead.status = status
    await db.commit()
    return {
        "lead_id": lead.id,
        "old_status": old_status,
        "new_status": status,
    }


async def _handle_get_analytics_overview(_input: dict, db: AsyncSession) -> dict:
    result = await db.execute(select(func.count(SearchProfile.id)))
    profile_count = result.scalar_one()

    result = await db.execute(select(func.count(Company.id)))
    company_count = result.scalar_one()

    result = await db.execute(
        select(Vacancy.status, func.count(Vacancy.id)).group_by(Vacancy.status)
    )
    vacancy_by_status = {row[0]: row[1] for row in result.all()}

    result = await db.execute(
        select(Lead.status, func.count(Lead.id)).group_by(Lead.status)
    )
    lead_by_status = {row[0]: row[1] for row in result.all()}

    result = await db.execute(
        select(
            func.avg(Lead.composite_score),
            func.avg(Lead.fit_score),
            func.avg(Lead.timing_score),
        )
    )
    scores = result.one()

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
            "avg_composite_score": round(float(scores[0] or 0), 1),
            "avg_fit_score": round(float(scores[1] or 0), 1),
            "avg_timing_score": round(float(scores[2] or 0), 1),
        },
    }


async def _handle_get_harvest_summary(tool_input: dict, db: AsyncSession) -> dict:
    profile_id = tool_input.get("profile_id")
    last_n = tool_input.get("last_n_runs", 10)

    query = select(HarvestRun).order_by(HarvestRun.id.desc()).limit(last_n)
    if profile_id is not None:
        query = query.where(HarvestRun.profile_id == profile_id)

    result = await db.execute(query)
    runs = result.scalars().all()

    return {
        "runs": [
            {
                "id": r.id,
                "profile_id": r.profile_id,
                "source": r.source,
                "status": r.status,
                "vacancies_found": r.vacancies_found,
                "vacancies_new": r.vacancies_new,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in runs
        ],
        "total_runs": len(runs),
        "completed": sum(1 for r in runs if r.status == "completed"),
        "failed": sum(1 for r in runs if r.status == "failed"),
        "total_vacancies_found": sum(r.vacancies_found for r in runs),
        "total_vacancies_new": sum(r.vacancies_new for r in runs),
    }
