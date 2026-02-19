import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

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
        params = {
            "engine": "google_jobs",
            "q": query,
            "location": location,
            "hl": "nl",
            "api_key": self.api_key,
        }
        logger.info("SerpAPI search: query=%r location=%r", query, location)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(SERPAPI_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

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
