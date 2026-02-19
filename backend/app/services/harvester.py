import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.harvest import HarvestRun
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.scrapers.indeed import IndeedResult, IndeedScraper
from app.scrapers.serpapi import SerpApiHarvester, SerpApiResult
from app.services.dedup import find_or_create_company
from app.utils.date_parser import parse_relative_date

logger = logging.getLogger(__name__)


class HarvestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_harvest(
        self, profile_id: int, source: str = "google_jobs"
    ) -> HarvestRun:
        """Execute a harvest run for a profile using the specified source."""
        result = await self.db.execute(
            select(SearchProfile)
            .where(SearchProfile.id == profile_id)
            .options(selectinload(SearchProfile.search_terms))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise ValueError(f"Profile {profile_id} not found")

        run = HarvestRun(
            profile_id=profile_id,
            source=source,
            status="running",
            started_at=datetime.now(UTC),
        )
        self.db.add(run)
        await self.db.flush()

        try:
            all_results = await self._search_source(profile, source)

            new_count = 0
            for item in all_results:
                was_new = await self._store_vacancy(item, profile_id, run.id)
                if was_new:
                    new_count += 1

            run.status = "completed"
            run.vacancies_found = len(all_results)
            run.vacancies_new = new_count
            run.completed_at = datetime.now(UTC)

        except Exception as exc:
            logger.error("Harvest run %d failed: %s", run.id, exc)
            run.status = "failed"
            run.error_message = str(exc)
            run.completed_at = datetime.now(UTC)

        await self.db.commit()
        return run

    async def _search_source(
        self, profile: SearchProfile, source: str
    ) -> list[SerpApiResult | IndeedResult]:
        """Search all terms for a profile using the given source."""
        all_results: list[SerpApiResult | IndeedResult] = []

        for term in profile.search_terms:
            if source == "google_jobs":
                harvester = SerpApiHarvester(api_key=settings.serpapi_key)
                results = await harvester.search(term.term)
            elif source == "indeed":
                scraper = IndeedScraper()
                results = await scraper.search(term.term)
            else:
                raise ValueError(f"Unknown source: {source}")
            all_results.extend(results)

        return all_results

    async def _store_vacancy(
        self,
        item: SerpApiResult | IndeedResult,
        profile_id: int,
        run_id: int,
    ) -> bool:
        """Store a vacancy record, deduplicating by source + external_id.

        Returns True if the vacancy was new.
        """
        if item.external_id:
            result = await self.db.execute(
                select(Vacancy).where(
                    Vacancy.source == item.source,
                    Vacancy.external_id == item.external_id,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.last_seen_at = datetime.now(UTC)
                return False

        company = await find_or_create_company(self.db, item.company_name)

        # Parse published_at from source's relative date string
        posted_at_raw = getattr(item, "posted_at", None)
        published_at = parse_relative_date(posted_at_raw) if posted_at_raw else None

        vacancy = Vacancy(
            external_id=item.external_id,
            source=item.source,
            search_profile_id=profile_id,
            company_id=company.id,
            company_name_raw=item.company_name,
            job_title=item.job_title,
            job_url=item.job_url if hasattr(item, "job_url") else "",
            location=item.location,
            raw_text=item.description if hasattr(item, "description") else None,
            published_at=published_at,
            harvest_run_id=run_id,
        )
        self.db.add(vacancy)
        await self.db.flush()
        return True
