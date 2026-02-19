from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.harvest import HarvestRun
from app.worker import trigger_harvest_task

router = APIRouter(prefix="/api/harvest", tags=["harvest"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


class TriggerRequest(BaseModel):
    profile_id: int
    source: str = "google_jobs"


class HarvestRunResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    profile_id: int
    source: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    vacancies_found: int
    vacancies_new: int
    error_message: str | None


@router.post("/trigger", status_code=202)
async def trigger_harvest(payload: TriggerRequest) -> dict:
    """Queue a harvest run for a profile."""
    task = trigger_harvest_task.delay(payload.profile_id, payload.source)
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": payload.profile_id,
        "source": payload.source,
    }


@router.get("/runs", response_model=list[HarvestRunResponse])
async def list_harvest_runs(
    db: DbSession,
    profile_id: int | None = None,
) -> list[HarvestRun]:
    """List harvest runs, optionally filtered by profile."""
    query = select(HarvestRun).order_by(HarvestRun.id.desc()).limit(50)
    if profile_id:
        query = query.where(HarvestRun.profile_id == profile_id)
    result = await db.execute(query)
    return list(result.scalars().all())
