from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import EventLog


def log_event(
    db: AsyncSession,
    *,
    event_type: str,
    entity_type: str,
    entity_id: int | None = None,
    metadata: dict | None = None,
) -> EventLog:
    event = EventLog(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata or {},
    )
    db.add(event)
    return event
