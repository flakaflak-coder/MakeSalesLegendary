import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.config import settings
from app.utils.api_cache import cache_get, cache_put

logger = logging.getLogger(__name__)


async def _request_with_retry(
    client: httpx.AsyncClient, url: str, params: dict, max_retries: int = 3
) -> dict:
    """Make a GET request with retry on 5xx errors, connection errors, and timeouts."""
    for attempt in range(max_retries):
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except (
            httpx.HTTPStatusError,
            httpx.ConnectError,
            httpx.TimeoutException,
        ) as exc:
            if (
                isinstance(exc, httpx.HTTPStatusError)
                and exc.response.status_code < 500
            ):
                raise
            if attempt == max_retries - 1:
                raise
            wait_time = 2**attempt
            logger.warning(
                "SerpAPI request failed (attempt %d/%d), retrying in %ds: %s",
                attempt + 1,
                max_retries,
                wait_time,
                exc,
            )
            await asyncio.sleep(wait_time)
    raise RuntimeError("Unreachable")


SERPAPI_BASE_URL = "https://serpapi.com/search"


@dataclass
class SerpApiResult:
    external_id: str
    job_title: str
    company_name: str
    location: str
    description: str
    job_url: str
    source: str
    posted_at: str | None = None


class SerpApiHarvester:
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def search(
        self, query: str, location: str = "Netherlands"
    ) -> list[SerpApiResult]:
        """Search Google Jobs via SerpAPI for a given query string."""
        cache_params = {"query": query, "location": location}

        if settings.api_cache_enabled:
            cached = cache_get("serpapi", cache_params, settings.api_cache_max_age_days)
            if cached is not None:
                logger.info("SerpAPI cache hit: query=%r", query)
                return self.parse_response(cached)

        params = {
            "engine": "google_jobs",
            "q": query,
            "location": location,
            "hl": "nl",
            "api_key": self.api_key,
        }
        logger.info("SerpAPI search: query=%r location=%r", query, location)

        async with httpx.AsyncClient(timeout=30) as client:
            data = await _request_with_retry(client, SERPAPI_BASE_URL, params)

        if settings.api_cache_enabled:
            cache_put("serpapi", cache_params, data)

        results = self.parse_response(data)
        logger.info("SerpAPI returned %d results for query=%r", len(results), query)
        return results

    def parse_response(self, data: dict) -> list[SerpApiResult]:
        """Parse the SerpAPI JSON response into structured results."""
        jobs = data.get("jobs_results", [])
        results: list[SerpApiResult] = []

        for job in jobs:
            apply_options = job.get("apply_options", [])
            job_url = apply_options[0].get("link", "") if apply_options else ""
            extensions = job.get("detected_extensions", {})

            results.append(
                SerpApiResult(
                    external_id=job.get("job_id", ""),
                    job_title=job.get("title", ""),
                    company_name=job.get("company_name", ""),
                    location=job.get("location", ""),
                    description=job.get("description", ""),
                    job_url=job_url,
                    source="google_jobs",
                    posted_at=extensions.get("posted_at"),
                )
            )
        return results
