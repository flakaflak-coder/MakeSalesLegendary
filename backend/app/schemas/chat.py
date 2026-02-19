from pydantic import BaseModel


class ChatContext(BaseModel):
    """Optional context about where the user is in the app."""

    profile_id: int | None = None
    lead_id: int | None = None
    page: str | None = None  # "dashboard", "leads", "lead-detail", etc.


class ChatRequest(BaseModel):
    """User's chat message with optional context."""

    message: str
    context: ChatContext | None = None


class ToolCallResult(BaseModel):
    """A single tool call made by the agent."""

    tool: str
    data: dict | None = None


class ChatResponse(BaseModel):
    """Agent response with text and any tool call results."""

    reply: str
    tool_calls: list[ToolCallResult] = []
