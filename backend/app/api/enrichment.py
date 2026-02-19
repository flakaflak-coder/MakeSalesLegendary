from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.enrichment import EnrichmentRun
from app.models.extraction_prompt import ExtractionPrompt
from app.schemas.enrichment import (
    EnrichmentRunResponse,
    EnrichmentTriggerRequest,
    ExtractionPromptCreate,
    ExtractionPromptResponse,
)
from app.services.event_log import log_event

router = APIRouter(prefix="/api/enrichment", tags=["enrichment"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/profiles/{profile_id}/prompts",
    response_model=list[ExtractionPromptResponse],
)
async def list_extraction_prompts(
    profile_id: int, db: DbSession
) -> list[ExtractionPrompt]:
    """List all extraction prompt versions for a profile."""
    result = await db.execute(
        select(ExtractionPrompt)
        .where(ExtractionPrompt.profile_id == profile_id)
        .order_by(ExtractionPrompt.version.desc())
    )
    return list(result.scalars().all())


@router.get(
    "/profiles/{profile_id}/prompts/active",
    response_model=ExtractionPromptResponse,
)
async def get_active_prompt(profile_id: int, db: DbSession) -> ExtractionPrompt:
    """Get the currently active extraction prompt for a profile."""
    result = await db.execute(
        select(ExtractionPrompt).where(
            ExtractionPrompt.profile_id == profile_id,
            ExtractionPrompt.is_active == True,  # noqa: E712
        )
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(404, "No active extraction prompt for this profile")
    return prompt


@router.post(
    "/profiles/{profile_id}/prompts",
    response_model=ExtractionPromptResponse,
    status_code=201,
)
async def create_extraction_prompt(
    profile_id: int,
    payload: ExtractionPromptCreate,
    db: DbSession,
) -> ExtractionPrompt:
    """Create a new extraction prompt version.

    Deactivates the previous active version.
    """
    # Find current max version
    result = await db.execute(
        select(ExtractionPrompt.version)
        .where(ExtractionPrompt.profile_id == profile_id)
        .order_by(ExtractionPrompt.version.desc())
        .limit(1)
    )
    max_version = result.scalar_one_or_none() or 0

    # Deactivate current active prompt
    result = await db.execute(
        select(ExtractionPrompt).where(
            ExtractionPrompt.profile_id == profile_id,
            ExtractionPrompt.is_active == True,  # noqa: E712
        )
    )
    current_active = result.scalar_one_or_none()
    if current_active:
        current_active.is_active = False

    # Create new version
    prompt = ExtractionPrompt(
        profile_id=profile_id,
        version=max_version + 1,
        system_prompt=payload.system_prompt,
        extraction_schema=payload.extraction_schema,
        is_active=True,
        notes=payload.notes,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return prompt


@router.get("/runs", response_model=list[EnrichmentRunResponse])
async def list_enrichment_runs(
    db: DbSession,
    profile_id: int | None = None,
    pass_type: str | None = None,
) -> list[EnrichmentRun]:
    """List enrichment runs with optional filters."""
    query = select(EnrichmentRun).order_by(EnrichmentRun.id.desc()).limit(50)
    if profile_id:
        query = query.where(EnrichmentRun.profile_id == profile_id)
    if pass_type:
        query = query.where(EnrichmentRun.pass_type == pass_type)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/trigger", status_code=202)
async def trigger_enrichment(payload: EnrichmentTriggerRequest, db: DbSession) -> dict:
    """Queue an enrichment run for a profile."""
    from app.worker import trigger_enrichment_task

    task = trigger_enrichment_task.delay(payload.profile_id, payload.pass_type)
    log_event(
        db,
        event_type="enrichment.triggered",
        entity_type="profile",
        entity_id=payload.profile_id,
        metadata={"pass_type": payload.pass_type, "task_id": task.id},
    )
    await db.commit()
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": payload.profile_id,
        "pass_type": payload.pass_type,
    }
