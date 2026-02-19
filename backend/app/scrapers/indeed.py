import asyncio
import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


async def _request_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict | None = None,
    max_retries: int = 3,
) -> httpx.Response:
    """Make a GET request with retry on 5xx errors, connection errors, and timeouts."""
    for attempt in range(max_retries):
        try:
            response = await client.get(url, headers=headers, follow_redirects=True)
            response.raise_for_status()
            return response
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
                "Indeed request failed (attempt %d/%d), retrying in %ds: %s",
                attempt + 1,
                max_retries,
                wait_time,
                exc,
            )
            await asyncio.sleep(wait_time)
    raise RuntimeError("Unreachable")

INDEED_BASE_URL = "https://nl.indeed.com/jobs"


@dataclass
class IndeedResult:
    external_id: str
    job_title: str
    company_name: str
    location: str
    job_url: str
    source: str = "indeed"
    posted_at: str | None = None
    description: str | None = None


class IndeedScraper:
    async def search(self, query: str, location: str = "") -> list[IndeedResult]:
        """Scrape Indeed.nl for job listings matching the query."""
        params = {"q": query, "l": location}
        url = f"{INDEED_BASE_URL}?{urlencode(params)}"

        logger.info("Indeed scrape: query=%r location=%r", query, location)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await _request_with_retry(
                client,
                url,
                headers={"User-Agent": "Mozilla/5.0"},
            )

        results = self.parse_html(response.text)
        logger.info("Indeed returned %d results for query=%r", len(results), query)
        return results

    def parse_html(self, html: str) -> list[IndeedResult]:
        """Parse Indeed HTML into structured results."""
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("div.job_seen_beacon")
        results: list[IndeedResult] = []

        for card in cards:
            title_el = card.select_one("h2.jobTitle a span")
            link_el = card.select_one("h2.jobTitle a")
            company_el = card.select_one("[data-testid='company-name']")
            location_el = card.select_one("[data-testid='text-location']")
            date_el = card.select_one(
                "[data-testid='myJobsStateDate']"
            ) or card.select_one(".date")
            snippet_el = card.select_one(
                "div.job-snippet"
            ) or card.select_one("[class*='job-snippet']") or card.select_one(
                "table.jobCardShelfContainer tr td"
            )

            if not title_el:
                continue

            job_key = ""
            if link_el and link_el.get("data-jk"):
                job_key = link_el["data-jk"]
            elif link_el and link_el.get("href"):
                href = link_el["href"]
                if "jk=" in href:
                    job_key = href.split("jk=")[-1].split("&")[0]

            description_text = snippet_el.get_text(strip=True) if snippet_el else None

            results.append(
                IndeedResult(
                    external_id=f"indeed_{job_key}" if job_key else "",
                    job_title=title_el.get_text(strip=True),
                    company_name=(
                        company_el.get_text(strip=True) if company_el else ""
                    ),
                    location=(location_el.get_text(strip=True) if location_el else ""),
                    job_url=(
                        f"https://nl.indeed.com/viewjob?jk={job_key}" if job_key else ""
                    ),
                    posted_at=(date_el.get_text(strip=True) if date_el else None),
                    description=description_text,
                )
            )
        return results
