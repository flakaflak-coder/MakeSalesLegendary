from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.event import EventLog
from app.schemas.event import EventLogResponse

router = APIRouter(prefix="/api/events", tags=["events"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[EventLogResponse])
async def list_events(
    db: DbSession,
    event_type: str | None = Query(None),
    entity_type: str | None = Query(None),
    entity_id: int | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[EventLog]:
    query = select(EventLog).order_by(EventLog.id.desc())
    if event_type:
        query = query.where(EventLog.event_type == event_type)
    if entity_type:
        query = query.where(EventLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.where(EventLog.entity_id == entity_id)

    result = await db.execute(query.limit(limit).offset(offset))
    return list(result.scalars().all())
