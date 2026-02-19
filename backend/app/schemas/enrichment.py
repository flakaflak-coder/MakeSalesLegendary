from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExtractionPromptCreate(BaseModel):
    system_prompt: str
    extraction_schema: dict
    notes: str | None = None


class ExtractionPromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    version: int
    system_prompt: str
    extraction_schema: dict
    is_active: bool
    created_at: datetime
    notes: str | None


class EnrichmentRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    pass_type: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    items_processed: int
    items_succeeded: int
    items_failed: int
    error_message: str | None
    tokens_input: int
    tokens_output: int


class EnrichmentTriggerRequest(BaseModel):
    profile_id: int
    pass_type: str = "llm"
