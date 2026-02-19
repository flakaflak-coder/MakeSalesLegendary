import hashlib
import logging
from dataclasses import dataclass, field

import anthropic

from app.config import settings
from app.utils.api_cache import cache_get, cache_put

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    extracted_data: dict = field(default_factory=dict)
    tokens_input: int = 0
    tokens_output: int = 0
    model: str = ""
    success: bool = False
    error: str | None = None


class ClaudeLLMClient:
    """Low-level client wrapping the Anthropic SDK for structured extraction."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    def _build_extraction_tool(self, extraction_schema: dict) -> dict:
        """Build a tool definition from an extraction schema.

        The extraction_schema maps field names to description strings.
        Each field becomes a property in the tool's input_schema.
        """
        properties: dict = {}
        for field_name, description in extraction_schema.items():
            properties[field_name] = {
                "description": description,
                "anyOf": [
                    {"type": "string"},
                    {"type": "array", "items": {"type": "string"}},
                    {"type": "null"},
                ],
            }

        return {
            "name": "extract_vacancy_data",
            "description": (
                "Extract structured data from a job vacancy text. "
                "Return null for any field where the information "
                "is not present in the text."
            ),
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": list(extraction_schema.keys()),
            },
        }

    async def extract_vacancy_data(
        self,
        vacancy_text: str,
        extraction_schema: dict,
        system_prompt: str,
    ) -> ExtractionResult:
        """Extract structured data from vacancy text using Claude tool_use."""
        # Check cache — keyed on text hash + schema so same vacancy isn't extracted twice
        text_hash = hashlib.sha256(vacancy_text.encode()).hexdigest()[:16]
        cache_params = {"text_hash": text_hash, "schema_keys": sorted(extraction_schema.keys())}

        if settings.api_cache_enabled:
            cached = cache_get("claude_llm", cache_params, max_age_days=0)  # LLM cache never expires
            if cached is not None:
                logger.info("LLM cache hit: text_hash=%s", text_hash)
                return ExtractionResult(
                    extracted_data=cached.get("extracted_data", {}),
                    tokens_input=cached.get("tokens_input", 0),
                    tokens_output=cached.get("tokens_output", 0),
                    model=cached.get("model", self.model),
                    success=True,
                )

        tool = self._build_extraction_tool(extraction_schema)

        logger.info(
            "LLM extraction: model=%s fields=%d text_length=%d",
            self.model,
            len(extraction_schema),
            len(vacancy_text),
        )

        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system_prompt,
                tools=[tool],
                tool_choice={"type": "tool", "name": "extract_vacancy_data"},
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Extract structured data from this job vacancy text:\n\n"
                            f"---\n{vacancy_text}\n---"
                        ),
                    }
                ],
                timeout=60.0,
            )
        except Exception as exc:
            logger.error("LLM extraction failed: %s", exc)
            return ExtractionResult(
                success=False,
                error=str(exc),
                model=self.model,
            )

        # Parse tool_use response
        extracted_data = {}
        for block in response.content:
            if block.type == "tool_use" and block.name == "extract_vacancy_data":
                extracted_data = block.input
                break

        # Fill missing fields with None
        for field_name in extraction_schema:
            if field_name not in extracted_data:
                extracted_data[field_name] = None

        logger.info(
            "LLM extraction completed: tokens_in=%d tokens_out=%d fields_extracted=%d",
            response.usage.input_tokens,
            response.usage.output_tokens,
            sum(1 for v in extracted_data.values() if v is not None),
        )

        result = ExtractionResult(
            extracted_data=extracted_data,
            tokens_input=response.usage.input_tokens,
            tokens_output=response.usage.output_tokens,
            model=self.model,
            success=True,
        )

        if settings.api_cache_enabled:
            cache_put("claude_llm", cache_params, {
                "extracted_data": extracted_data,
                "tokens_input": response.usage.input_tokens,
                "tokens_output": response.usage.output_tokens,
                "model": self.model,
            })

        return result
