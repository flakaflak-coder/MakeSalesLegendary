from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EventLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: str
    entity_type: str
    entity_id: int | None
    metadata: dict
    created_at: datetime
