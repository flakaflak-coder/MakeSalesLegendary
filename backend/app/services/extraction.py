import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.claude_llm import ClaudeLLMClient
from app.models.enrichment import EnrichmentRun
from app.models.extraction_prompt import ExtractionPrompt
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)


def compute_extraction_quality(extracted_data: dict, schema: dict) -> float:
    """Compute quality score (0.0-1.0) based on how many schema fields were extracted.

    A field counts as extracted if its value is not None and not an empty string/list.
    """
    if not schema:
        return 0.0

    extracted_count = 0
    for field_name in schema:
        value = extracted_data.get(field_name)
        if value is not None and value != "" and value != []:
            extracted_count += 1

    return extracted_count / len(schema)


class ExtractionService:
    """Pass 1: LLM extraction from vacancy text."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._llm_client = ClaudeLLMClient(
            api_key=settings.anthropic_api_key,
            model=settings.enrichment_llm_model,
        )

    async def run_llm_extraction(self, profile_id: int) -> EnrichmentRun:
        """Run LLM extraction on all pending vacancies for a profile."""
        # Load active extraction prompt
        result = await self.db.execute(
            select(ExtractionPrompt).where(
                ExtractionPrompt.profile_id == profile_id,
                ExtractionPrompt.is_active == True,  # noqa: E712
            )
        )
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise ValueError(f"No active extraction prompt for profile {profile_id}")

        # Create enrichment run record
        run = EnrichmentRun(
            profile_id=profile_id,
            pass_type="llm",
            status="running",
            started_at=datetime.now(UTC),
        )
        self.db.add(run)
        await self.db.flush()

        # Find pending vacancies with raw_text
        result = await self.db.execute(
            select(Vacancy).where(
                Vacancy.search_profile_id == profile_id,
                Vacancy.extraction_status == "pending",
                Vacancy.raw_text.isnot(None),
                Vacancy.raw_text != "",
            )
        )
        vacancies = list(result.scalars().all())

        if not vacancies:
            logger.info("No pending vacancies for extraction in profile %d", profile_id)
            run.status = "completed"
            run.completed_at = datetime.now(UTC)
            await self.db.commit()
            return run

        logger.info(
            "Starting LLM extraction for %d vacancies in profile %d",
            len(vacancies),
            profile_id,
        )

        succeeded = 0
        failed = 0
        total_tokens_in = 0
        total_tokens_out = 0

        semaphore = asyncio.Semaphore(5)

        async def _extract_one(vacancy: Vacancy) -> None:
            nonlocal succeeded, failed, total_tokens_in, total_tokens_out

            try:
                async with semaphore:
                    extraction = await self._llm_client.extract_vacancy_data(
                        vacancy_text=vacancy.raw_text,
                        extraction_schema=prompt.extraction_schema,
                        system_prompt=prompt.system_prompt,
                    )
            except Exception as exc:
                vacancy.extraction_status = "failed"
                vacancy.extraction_run_id = run.id
                failed += 1
                logger.warning(
                    "LLM extraction raised exception for vacancy %d: %s",
                    vacancy.id,
                    exc,
                )
                return

            run.items_processed += 1

            if extraction.success:
                # Validate and sanitize extracted data
                sanitized = self._sanitize_extraction(
                    extraction.extracted_data, prompt.extraction_schema
                )
                vacancy.extracted_data = sanitized
                vacancy.extraction_status = "completed"
                vacancy.extraction_run_id = run.id
                succeeded += 1
                total_tokens_in += extraction.tokens_input
                total_tokens_out += extraction.tokens_output
            else:
                vacancy.extraction_status = "failed"
                vacancy.extraction_run_id = run.id
                failed += 1
                logger.warning(
                    "LLM extraction failed for vacancy %d: %s",
                    vacancy.id,
                    extraction.error,
                )

        await asyncio.gather(*[_extract_one(v) for v in vacancies])

        run.items_succeeded = succeeded
        run.items_failed = failed
        run.tokens_input = total_tokens_in
        run.tokens_output = total_tokens_out
        run.status = "completed"
        run.completed_at = datetime.now(UTC)

        await self.db.commit()

        logger.info(
            "LLM extraction run %d completed: %d succeeded, %d failed, "
            "%d input tokens, %d output tokens",
            run.id,
            succeeded,
            failed,
            total_tokens_in,
            total_tokens_out,
        )
        return run

    def _sanitize_extraction(self, extracted: dict, schema: dict) -> dict:
        """Sanitize and validate LLM extraction output.

        - Ensures only expected fields are stored
        - Strips any unexpected nested structures
        - Fills missing fields with None
        """
        sanitized: dict = {}
        for field_name in schema:
            value = extracted.get(field_name)
            # Accept strings, lists of strings, and None
            if isinstance(value, list):
                sanitized[field_name] = [str(v) for v in value if v is not None]
            elif isinstance(value, str):
                sanitized[field_name] = value.strip() if value else None
            else:
                sanitized[field_name] = None
        return sanitized
