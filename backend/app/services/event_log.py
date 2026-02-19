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
    """Create an EventLog and add it to the session.

    The caller is responsible for committing the session (``await db.commit()``)
    to persist the event. ``db.add()`` itself is synchronous, so this helper
    does not need to be async.
    """
    event = EventLog(
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        event_metadata=metadata or {},
    )
    db.add(event)
    return event
