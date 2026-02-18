"""
Agent 1 — Vacancy Scanner

Continuously monitors LinkedIn Jobs (via RapidAPI) for companies
hiring for AP-related roles. Writes new leads to Google Sheets.
"""

import logging
from datetime import datetime

from models.lead import Lead
from tools import google_sheets, linkedin_jobs

logger = logging.getLogger(__name__)


class VacancyScanner:
    """
    Scans job platforms for AP-related openings and produces a list of
    target companies (leads) with supporting evidence (job title + URL).
    """

    def __init__(self, location: str = "Netherlands", max_per_title: int = 25):
        self.location = location
        self.max_per_title = max_per_title

    def run(self) -> list[Lead]:
        """
        Execute the scan. Returns all new leads found (not previously in Sheets).
        """
        logger.info("=== Agent 1: Vacancy Scanner starting ===")

        # 1. Pull existing company names from Sheets to avoid re-processing
        existing_companies = google_sheets.get_existing_company_names()
        logger.info(
            "%d existing companies already in sheet.", len(existing_companies)
        )

        # 2. Search LinkedIn Jobs
        all_leads = linkedin_jobs.search_ap_vacancies(
            location=self.location,
            max_results_per_title=self.max_per_title,
        )

        # 3. Split into new vs already known
        new_leads: list[Lead] = []
        seen_leads: list[Lead] = []

        for lead in all_leads:
            if lead.dedup_key in existing_companies:
                seen_leads.append(lead)
            else:
                new_leads.append(lead)

        # 4. Update "last seen" for companies we've seen before
        now = datetime.utcnow().isoformat()
        for lead in seen_leads:
            google_sheets.update_lead_last_seen(lead.company_name, now)

        # 5. Write new leads to Google Sheets
        written = google_sheets.write_leads(new_leads)
        logger.info(
            "=== Agent 1 complete — %d new lead(s) added to sheet. ===", written
        )

        return new_leads
