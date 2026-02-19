import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

INDEED_BASE_URL = "https://nl.indeed.com/jobs"


@dataclass
class IndeedResult:
    external_id: str
    job_title: str
    company_name: str
    location: str
    job_url: str
    source: str = "indeed"


class IndeedScraper:
    async def search(self, query: str, location: str = "") -> list[IndeedResult]:
        """Scrape Indeed.nl for job listings matching the query."""
        params = {"q": query, "l": location}
        url = f"{INDEED_BASE_URL}?{urlencode(params)}"

        logger.info("Indeed scrape: query=%r location=%r", query, location)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0"},
                follow_redirects=True,
            )
            response.raise_for_status()

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

            if not title_el:
                continue

            job_key = ""
            if link_el and link_el.get("data-jk"):
                job_key = link_el["data-jk"]
            elif link_el and link_el.get("href"):
                href = link_el["href"]
                if "jk=" in href:
                    job_key = href.split("jk=")[-1].split("&")[0]

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
                )
            )
        return results
