import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.company_info import CompanyInfoClient
from app.integrations.kvk import KvKClient
from app.models.company import Company
from app.models.enrichment import EnrichmentRun
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)


class ExternalEnrichmentService:
    """Pass 2: External API enrichment for qualifying companies."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._kvk_client = KvKClient(
            api_key=settings.kvk_api_key,
            base_url=settings.kvk_api_base_url,
        )
        self._company_info_client = CompanyInfoClient(
            api_key=settings.company_info_api_key,
            base_url=settings.company_info_api_base_url,
        )

    async def run_external_enrichment(self, profile_id: int) -> EnrichmentRun:
        """Enrich companies with external API data for a given profile.

        Only processes companies that:
        1. Have at least one vacancy linked to this profile
        2. Have extraction_quality >= threshold
        3. Have enrichment_status == "pending"
        """
        run = EnrichmentRun(
            profile_id=profile_id,
            pass_type="external",
            status="running",
            started_at=datetime.now(UTC),
        )
        self.db.add(run)
        await self.db.flush()

        threshold = settings.enrichment_min_quality_threshold

        # Find qualifying companies
        result = await self.db.execute(
            select(Company)
            .join(Vacancy, Vacancy.company_id == Company.id)
            .where(
                Vacancy.search_profile_id == profile_id,
                Company.enrichment_status == "pending",
                Company.extraction_quality >= threshold,
            )
            .distinct()
        )
        companies = list(result.scalars().all())

        if not companies:
            logger.info(
                "No qualifying companies for external enrichment in profile %d",
                profile_id,
            )
            run.status = "completed"
            run.completed_at = datetime.now(UTC)
            await self.db.commit()
            return run

        logger.info(
            "Starting external enrichment for %d companies in profile %d",
            len(companies),
            profile_id,
        )

        succeeded = 0
        failed = 0

        for company in companies:
            try:
                await self._enrich_company(company)
                company.enrichment_status = "completed"
                company.enrichment_run_id = run.id
                company.enriched_at = datetime.now(UTC)
                succeeded += 1
            except Exception as exc:
                logger.error(
                    "External enrichment failed for company %d (%s): %s",
                    company.id,
                    company.name,
                    exc,
                )
                company.enrichment_status = "failed"
                company.enrichment_run_id = run.id
                failed += 1

            run.items_processed += 1

        run.items_succeeded = succeeded
        run.items_failed = failed
        run.status = "completed"
        run.completed_at = datetime.now(UTC)

        await self.db.commit()

        logger.info(
            "External enrichment run %d completed: %d succeeded, %d failed",
            run.id,
            succeeded,
            failed,
        )
        return run

    async def _enrich_company(self, company: Company) -> None:
        """Enrich a single company with KvK and Company.info data."""
        # Step 1: Find KvK number if we don't have it
        if not company.kvk_number:
            kvk_number = await self._kvk_client.find_kvk_number(company.name)
            if kvk_number:
                company.kvk_number = kvk_number
                logger.info(
                    "Found KvK number %s for company %s",
                    kvk_number,
                    company.name,
                )

        # Step 2: Get full KvK profile
        if company.kvk_number:
            kvk_data = await self._kvk_client.get_company_profile(company.kvk_number)
            if kvk_data:
                company.sbi_codes = kvk_data.sbi_codes
                company.entity_count = kvk_data.entity_count
                company.kvk_data = kvk_data.raw_data
                if kvk_data.employee_count and not company.employee_range:
                    company.employee_range = self._employee_count_to_range(
                        kvk_data.employee_count
                    )

        # Step 3: Get Company.info financial data
        if company.kvk_number:
            ci_data = await self._company_info_client.get_company_data(
                company.kvk_number
            )
            if ci_data:
                if ci_data.employee_range:
                    company.employee_range = ci_data.employee_range
                if ci_data.revenue_range:
                    company.revenue_range = ci_data.revenue_range
                company.company_info_data = ci_data.raw_data

        # Merge into enrichment_data blob for backward compatibility
        company.enrichment_data = {
            "kvk_data": company.kvk_data,
            "company_info_data": company.company_info_data,
        }

    @staticmethod
    def _employee_count_to_range(count: int) -> str:
        """Convert a numeric employee count to a range string."""
        if count < 10:
            return "1-9"
        elif count < 50:
            return "10-49"
        elif count < 100:
            return "50-99"
        elif count < 200:
            return "100-199"
        elif count < 500:
            return "200-499"
        elif count < 1000:
            return "500-999"
        else:
            return "1000+"
