import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.lead import ScoringConfig
from app.schemas.lead import ScoringConfigResponse, ScoringConfigUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scoring", tags=["scoring"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/{profile_id}", response_model=ScoringConfigResponse)
async def get_scoring_config(profile_id: int, db: DbSession) -> dict:
    """Get the active scoring configuration for a profile.

    Returns sensible defaults if no config has been created yet.
    """
    from app.services.scoring import (
        DEFAULT_FIT_CRITERIA,
        DEFAULT_MINIMUM_FILTERS,
        DEFAULT_TIMING_SIGNALS,
    )

    result = await db.execute(
        select(ScoringConfig).where(
            ScoringConfig.profile_id == profile_id,
            ScoringConfig.is_active == True,  # noqa: E712
        )
    )
    config = result.scalar_one_or_none()
    if config:
        return config

    # Return defaults when no config exists yet
    return {
        "id": 0,
        "profile_id": profile_id,
        "version": 0,
        "is_active": True,
        "fit_weight": 0.6,
        "timing_weight": 0.4,
        "fit_criteria": DEFAULT_FIT_CRITERIA,
        "timing_signals": DEFAULT_TIMING_SIGNALS,
        "score_thresholds": {
            "hot": 75,
            "warm": 50,
            "monitor": 25,
            "minimum_filters": DEFAULT_MINIMUM_FILTERS,
        },
    }


@router.get("/{profile_id}/versions", response_model=list[ScoringConfigResponse])
async def list_scoring_versions(profile_id: int, db: DbSession) -> list[ScoringConfig]:
    """List all scoring config versions for a profile."""
    result = await db.execute(
        select(ScoringConfig)
        .where(ScoringConfig.profile_id == profile_id)
        .order_by(ScoringConfig.version.desc())
    )
    return list(result.scalars().all())


@router.put("/{profile_id}", response_model=ScoringConfigResponse)
async def update_scoring_config(
    profile_id: int,
    payload: ScoringConfigUpdate,
    db: DbSession,
) -> ScoringConfig:
    """Update scoring configuration by creating a new version.

    The previous active version is deactivated and a new version inherits
    all values, with provided fields overridden.
    """
    # Validate weights sum to ~1.0 if both are provided
    if payload.fit_weight is not None and payload.timing_weight is not None:
        total = payload.fit_weight + payload.timing_weight
        if abs(total - 1.0) > 0.01:
            raise HTTPException(
                400,
                f"fit_weight + timing_weight must equal 1.0, got {total:.2f}",
            )

    # Find current active config
    result = await db.execute(
        select(ScoringConfig).where(
            ScoringConfig.profile_id == profile_id,
            ScoringConfig.is_active == True,  # noqa: E712
        )
    )
    current = result.scalar_one_or_none()

    # Determine the new version number
    result = await db.execute(
        select(ScoringConfig.version)
        .where(ScoringConfig.profile_id == profile_id)
        .order_by(ScoringConfig.version.desc())
        .limit(1)
    )
    max_version = result.scalar_one_or_none() or 0

    # Build new config inheriting from current or using defaults
    new_config = ScoringConfig(
        profile_id=profile_id,
        version=max_version + 1,
        is_active=True,
        fit_weight=payload.fit_weight
        if payload.fit_weight is not None
        else (current.fit_weight if current else 0.6),
        timing_weight=payload.timing_weight
        if payload.timing_weight is not None
        else (current.timing_weight if current else 0.4),
        fit_criteria=payload.fit_criteria
        if payload.fit_criteria is not None
        else (current.fit_criteria if current else {}),
        timing_signals=payload.timing_signals
        if payload.timing_signals is not None
        else (current.timing_signals if current else {}),
        score_thresholds=payload.score_thresholds
        if payload.score_thresholds is not None
        else (
            current.score_thresholds
            if current
            else {"hot": 75, "warm": 50, "monitor": 25}
        ),
    )

    # Deactivate current
    if current:
        current.is_active = False

    db.add(new_config)
    await db.commit()
    await db.refresh(new_config)

    logger.info(
        "Created scoring config v%d for profile %d",
        new_config.version,
        profile_id,
    )
    return new_config


@router.post("/{profile_id}/run", status_code=202)
async def trigger_scoring(profile_id: int, db: DbSession) -> dict:
    """Trigger scoring for all leads in a profile.

    Uses defaults if no explicit scoring config exists.
    """
    # Check for explicit config (optional — defaults are used if missing)
    result = await db.execute(
        select(ScoringConfig).where(
            ScoringConfig.profile_id == profile_id,
            ScoringConfig.is_active == True,  # noqa: E712
        )
    )
    config = result.scalar_one_or_none()
    config_version = config.version if config else 0

    try:
        from app.worker import trigger_scoring_task

        task = trigger_scoring_task.delay(profile_id)
        return {
            "status": "queued",
            "task_id": task.id,
            "profile_id": profile_id,
            "scoring_config_version": config_version,
        }
    except Exception:
        # Celery not available — run inline
        from app.services.scoring import ScoringService

        service = ScoringService(db=db)
        stats = await service.score_profile(profile_id)
        return {
            "status": "completed",
            "profile_id": profile_id,
            "scoring_config_version": config_version,
            **stats,
        }
