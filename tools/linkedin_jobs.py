"""
LinkedIn Jobs search via RapidAPI.
Docs: https://rapidapi.com/jaypat87/api/linkedin-job-search-api
"""

import logging
from typing import Optional

import requests

from config import AP_JOB_TITLES, RAPIDAPI_HOST_LINKEDIN_JOBS, RAPIDAPI_KEY
from models.lead import Lead

logger = logging.getLogger(__name__)

BASE_URL = f"https://{RAPIDAPI_HOST_LINKEDIN_JOBS}/active-jb-7d"

HEADERS = {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": RAPIDAPI_HOST_LINKEDIN_JOBS,
}


def search_ap_vacancies(
    location: str = "Netherlands",
    max_results_per_title: int = 25,
) -> list[Lead]:
    """
    Search LinkedIn Jobs for AP-related openings.
    Returns a deduplicated list of Lead objects.
    """
    if not RAPIDAPI_KEY:
        raise EnvironmentError("RAPIDAPI_KEY is not set in environment.")

    seen_companies: dict[str, Lead] = {}

    for title in AP_JOB_TITLES:
        logger.info("Scanning LinkedIn Jobs for: '%s' in %s", title, location)
        try:
            results = _fetch_jobs(title, location, max_results_per_title)
            for job in results:
                lead = _parse_job(job, title)
                if lead is None:
                    continue
                key = lead.dedup_key
                if key in seen_companies:
                    # Increment AP role count for the same company
                    seen_companies[key].open_ap_roles_count += 1
                    seen_companies[key].last_seen = lead.last_seen
                else:
                    seen_companies[key] = lead
        except Exception as exc:
            logger.error(
                "Error fetching jobs for title '%s': %s", title, exc
            )

    leads = list(seen_companies.values())
    logger.info("LinkedIn Jobs scan complete — %d unique companies found.", len(leads))
    return leads


def _fetch_jobs(title: str, location: str, limit: int) -> list[dict]:
    params = {
        "title_filter": f'"{title}"',
        "location_filter": location,
        "count": limit,
    }
    response = requests.get(BASE_URL, headers=HEADERS, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    # The API returns a list directly or under a key — handle both
    if isinstance(data, list):
        return data
    return data.get("jobs", data.get("data", []))


def _parse_job(job: dict, search_title: str) -> Optional[Lead]:
    company_name = (
        job.get("company_name")
        or job.get("company", {}).get("name")
        or ""
    ).strip()

    if not company_name:
        return None

    job_title = (
        job.get("title") or job.get("job_title") or search_title
    ).strip()

    job_url = (
        job.get("url")
        or job.get("job_url")
        or job.get("linkedin_url")
        or ""
    ).strip()

    location = (
        job.get("location")
        or job.get("job_location")
        or ""
    ).strip()

    company_data = job.get("company", {})
    industry = (
        company_data.get("industry")
        or job.get("industry")
        or ""
    ).strip()

    company_size = (
        company_data.get("company_size")
        or company_data.get("employee_count")
        or job.get("company_size")
        or ""
    )
    if isinstance(company_size, int):
        company_size = str(company_size)

    company_linkedin_url = (
        company_data.get("linkedin_url")
        or company_data.get("url")
        or ""
    ).strip()

    return Lead(
        company_name=company_name,
        job_title=job_title,
        job_url=job_url,
        location=location,
        industry=industry,
        company_size=str(company_size) if company_size else None,
        company_linkedin_url=company_linkedin_url or None,
    )
