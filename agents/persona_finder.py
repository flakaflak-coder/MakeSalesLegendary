"""
Agent 2 — Persona Finder

For each target company identified by the Vacancy Scanner, finds the
right people to contact inside that company — mapping the buying committee.
"""

import logging
from typing import Optional

from models.lead import Lead
from models.persona import Persona
from tools import apollo, google_sheets

logger = logging.getLogger(__name__)


class PersonaFinder:
    """
    Uses Apollo.io to find target personas (decision makers, champions,
    influencers) inside each target company.
    """

    def __init__(self, max_contacts_per_company: int = 5):
        self.max_contacts_per_company = max_contacts_per_company

    def run(self, leads: Optional[list[Lead]] = None) -> list[Persona]:
        """
        Find personas for the given leads. If leads is None, reads all
        leads from the Google Sheet.

        Returns all new personas found (not previously in Sheets).
        """
        logger.info("=== Agent 2: Persona Finder starting ===")

        # Load leads from sheet if not provided
        if leads is None:
            leads = self._load_leads_from_sheet()

        if not leads:
            logger.warning("No leads to process — Persona Finder exiting.")
            return []

        # Load already-known persona keys to avoid duplicates
        existing_persona_keys = google_sheets.get_existing_persona_keys()
        logger.info(
            "%d existing persona(s) already in sheet.",
            len(existing_persona_keys),
        )

        all_new_personas: list[Persona] = []

        for lead in leads:
            logger.info(
                "Searching personas for: %s (industry: %s)",
                lead.company_name,
                lead.industry or "unknown",
            )
            personas = apollo.find_personas_for_company(
                company_name=lead.company_name,
                company_linkedin_url=lead.company_linkedin_url,
                max_contacts=self.max_contacts_per_company,
            )

            # Filter out already-known personas
            new_personas = [
                p for p in personas
                if f"{p.company_name.lower()}|{p.full_name.lower()}"
                not in existing_persona_keys
            ]

            if new_personas:
                google_sheets.write_personas(new_personas)
                all_new_personas.extend(new_personas)
                # Update local cache to prevent duplicates within the same run
                for p in new_personas:
                    existing_persona_keys.add(
                        f"{p.company_name.lower()}|{p.full_name.lower()}"
                    )
            else:
                logger.info(
                    "No new personas found for %s.", lead.company_name
                )

        logger.info(
            "=== Agent 2 complete — %d new persona(s) found. ===",
            len(all_new_personas),
        )
        return all_new_personas

    def _load_leads_from_sheet(self) -> list[Lead]:
        """Read leads from Google Sheets and convert back to Lead objects."""
        records = google_sheets.get_all_leads()
        leads = []
        for r in records:
            leads.append(
                Lead(
                    company_name=r.get("Company Name", ""),
                    job_title=r.get("Job Title (Signal)", ""),
                    job_url=r.get("Job URL", ""),
                    company_size=r.get("Company Size") or None,
                    industry=r.get("Industry") or None,
                    location=r.get("Location") or None,
                    company_linkedin_url=r.get("Company LinkedIn URL") or None,
                    open_ap_roles_count=int(r.get("Open AP Roles (est.)", 1)),
                    first_detected=r.get("First Detected", ""),
                    last_seen=r.get("Last Seen", ""),
                )
            )
        return [l for l in leads if l.company_name]
