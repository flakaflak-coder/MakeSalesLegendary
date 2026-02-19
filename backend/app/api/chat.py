import json
import logging
from typing import Annotated

import anthropic
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.profile import SearchProfile
from app.schemas.chat import ChatRequest, ChatResponse, ToolCallResult
from app.services.chat_tools import CHAT_TOOLS, handle_tool_call

router = APIRouter(prefix="/api/chat", tags=["chat"])

DbSession = Annotated[AsyncSession, Depends(get_db)]

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are the Signal Engine assistant for a B2B lead "
    "generation platform built for Freeday.\n\n"
    "You help users manage their lead pipeline: harvesting "
    "job vacancies, enriching company data, scoring leads, "
    "and reviewing analytics.\n\n"
    "You speak Dutch and English. Match the user's language. "
    "Be concise and action-oriented. When you take an action, "
    "confirm what you did. When showing data, highlight the "
    "most important numbers. Do not use markdown formatting "
    "in your responses.\n\n"
    "{context_block}"
)

MAX_TOOL_ROUNDS = 5


async def _build_context_block(db: AsyncSession, request: ChatRequest) -> str:
    """Build a context string from the optional ChatContext."""
    parts: list[str] = []

    if request.context and request.context.profile_id:
        result = await db.execute(
            select(SearchProfile).where(SearchProfile.id == request.context.profile_id)
        )
        profile = result.scalar_one_or_none()
        if profile:
            parts.append(f"Active profile: {profile.name} (ID {profile.id})")

    if request.context and request.context.lead_id:
        parts.append(f"User is viewing lead ID {request.context.lead_id}")

    if request.context and request.context.page:
        parts.append(f"User is on the '{request.context.page}' page")

    if not parts:
        return ""
    return "Current context:\n" + "\n".join(f"- {p}" for p in parts) + "\n"


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: DbSession) -> ChatResponse:
    """Process a chat message using Claude with tools."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    context_block = await _build_context_block(db, request)
    system = SYSTEM_PROMPT.format(context_block=context_block)

    messages: list[dict] = [{"role": "user", "content": request.message}]
    tool_results: list[ToolCallResult] = []

    # Agentic loop: Claude may call multiple tools across multiple rounds
    for _round in range(MAX_TOOL_ROUNDS):
        logger.info("Chat round %d: sending %d messages", _round + 1, len(messages))

        try:
            response = await client.messages.create(
                model=settings.chat_model,
                max_tokens=2048,
                system=system,
                tools=CHAT_TOOLS,
                tool_choice={"type": "auto"},
                messages=messages,
                timeout=60.0,
            )
        except Exception as exc:
            logger.error("Chat LLM call failed: %s", exc)
            return ChatResponse(
                reply=f"Sorry, I couldn't process that right now. Error: {exc}",
                tool_calls=tool_results,
            )

        # Check if Claude wants to call tools
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

        if not tool_use_blocks:
            # No more tool calls — extract the text reply
            text_parts = [b.text for b in response.content if b.type == "text"]
            reply = "\n".join(text_parts) if text_parts else "Done."
            return ChatResponse(reply=reply, tool_calls=tool_results)

        # Execute each tool call and build tool_result messages
        assistant_content = []
        for block in response.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    }
                )

        messages.append({"role": "assistant", "content": assistant_content})

        tool_result_contents = []
        for block in tool_use_blocks:
            logger.info("Executing tool: %s(%s)", block.name, block.input)
            data = await handle_tool_call(block.name, block.input, db)
            tool_results.append(ToolCallResult(tool=block.name, data=data))
            tool_result_contents.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(data, default=str),
                }
            )

        messages.append({"role": "user", "content": tool_result_contents})

    # If we hit max rounds, return what we have
    return ChatResponse(
        reply="I ran into the maximum number of steps. Here's what I found so far.",
        tool_calls=tool_results,
    )
