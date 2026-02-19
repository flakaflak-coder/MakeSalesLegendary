import logging

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.extraction_prompt import ExtractionPrompt
from app.models.vacancy import Vacancy
from app.services.external_enrichment import ExternalEnrichmentService
from app.services.extraction import ExtractionService, compute_extraction_quality

logger = logging.getLogger(__name__)


class EnrichmentOrchestrator:
    """Orchestrates the two-pass enrichment pipeline."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._extraction_service = ExtractionService(db=db)
        self._external_service = ExternalEnrichmentService(db=db)

    async def run_full_enrichment(
        self,
        profile_id: int,
        pass_type: str = "both",
    ) -> dict:
        """Run enrichment pipeline for a profile.

        Args:
            profile_id: Which profile to enrich.
            pass_type: "llm", "external", or "both".

        Returns:
            Dict with "llm_run" and/or "external_run" enrichment run records.
        """
        result: dict = {}

        if pass_type in ("llm", "both"):
            logger.info("Starting Pass 1 (LLM extraction) for profile %d", profile_id)
            llm_run = await self._extraction_service.run_llm_extraction(profile_id)
            result["llm_run"] = llm_run

            # Update company-level quality scores after LLM pass
            await self._update_company_quality_scores(profile_id)

        if pass_type in ("external", "both"):
            logger.info(
                "Starting Pass 2 (external enrichment) for profile %d",
                profile_id,
            )
            ext_run = await self._external_service.run_external_enrichment(profile_id)
            result["external_run"] = ext_run

        return result

    async def _update_company_quality_scores(self, profile_id: int) -> None:
        """Update extraction_quality on companies based on their vacancies.

        Quality is the average extraction quality across all extracted vacancies
        for that company within this profile.
        """
        # Load active extraction prompt for the schema
        result = await self.db.execute(
            select(ExtractionPrompt).where(
                ExtractionPrompt.profile_id == profile_id,
                ExtractionPrompt.is_active == True,  # noqa: E712
            )
        )
        prompt = result.scalar_one_or_none()
        if not prompt:
            return

        # Find all companies with extracted vacancies for this profile
        result = await self.db.execute(
            select(distinct(Vacancy.company_id)).where(
                Vacancy.search_profile_id == profile_id,
                Vacancy.extraction_status == "completed",
                Vacancy.company_id.isnot(None),
            )
        )
        company_ids = [row[0] for row in result.all()]

        for company_id in company_ids:
            result = await self.db.execute(
                select(Vacancy).where(
                    Vacancy.company_id == company_id,
                    Vacancy.search_profile_id == profile_id,
                    Vacancy.extraction_status == "completed",
                    Vacancy.extracted_data.isnot(None),
                )
            )
            vacancies = list(result.scalars().all())

            if not vacancies:
                continue

            total_quality = 0.0
            for v in vacancies:
                total_quality += compute_extraction_quality(
                    v.extracted_data, prompt.extraction_schema
                )
            avg_quality = total_quality / len(vacancies)

            result = await self.db.execute(
                select(Company).where(Company.id == company_id)
            )
            company = result.scalar_one_or_none()
            if company:
                company.extraction_quality = round(avg_quality, 4)

        await self.db.commit()
        logger.info(
            "Updated extraction quality scores for %d companies in profile %d",
            len(company_ids),
            profile_id,
        )
