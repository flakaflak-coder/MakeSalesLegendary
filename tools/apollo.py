"""
Apollo.io People Search API.
Docs: https://apolloio.github.io/apollo-api-docs/?shell#people-search
"""

import logging
from typing import Optional

import requests

from config import (
    APOLLO_API_KEY,
    APOLLO_BASE_URL,
    CHAMPION_TITLES,
    DECISION_MAKER_TITLES,
    INFLUENCER_TITLES,
    TARGET_PERSONA_TITLES,
)
from models.persona import Persona

logger = logging.getLogger(__name__)


def find_personas_for_company(
    company_name: str,
    company_linkedin_url: Optional[str] = None,
    max_contacts: int = 5,
) -> list[Persona]:
    """
    Search Apollo.io for target personas at the given company.
    Returns up to max_contacts Persona objects.
    """
    if not APOLLO_API_KEY:
        raise EnvironmentError("APOLLO_API_KEY is not set in environment.")

    logger.info("Apollo: searching personas at '%s'", company_name)

    payload = {
        "api_key": APOLLO_API_KEY,
        "q_organization_name": company_name,
        "person_titles": TARGET_PERSONA_TITLES,
        "page": 1,
        "per_page": max_contacts,
    }
    if company_linkedin_url:
        payload["organization_linkedin_url"] = company_linkedin_url

    try:
        response = requests.post(
            f"{APOLLO_BASE_URL}/mixed_people/search",
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
    except Exception as exc:
        logger.error(
            "Apollo API error for company '%s': %s", company_name, exc
        )
        return []

    people = data.get("people", [])
    personas = [_parse_person(p, company_name) for p in people]
    personas = [p for p in personas if p is not None]

    logger.info(
        "Apollo: found %d persona(s) at '%s'", len(personas), company_name
    )
    return personas


def _parse_person(person: dict, company_name: str) -> Optional[Persona]:
    full_name = (
        person.get("name")
        or f"{person.get('first_name', '')} {person.get('last_name', '')}".strip()
    )
    if not full_name:
        return None

    job_title = (person.get("title") or "").strip()

    linkedin_url = (
        person.get("linkedin_url")
        or person.get("linkedin_id")
        or ""
    ).strip()

    email = None
    email_data = person.get("email")
    if isinstance(email_data, str) and "@" in email_data:
        email = email_data

    phone = None
    phone_numbers = person.get("phone_numbers", [])
    if phone_numbers:
        phone = phone_numbers[0].get("sanitized_number") or phone_numbers[0].get("raw_number")

    persona_type = _classify_persona(job_title)

    # Recent activity: Apollo returns headline / seniority / employment_history
    recent_activity = person.get("headline") or None

    # Last job change from employment history
    last_job_change = None
    employment = person.get("employment_history", [])
    if employment:
        last_role = employment[0]
        start = last_role.get("start_date") or last_role.get("raw_address")
        if start:
            last_job_change = str(start)

    # Prefer LinkedIn for outreach; fall back to email if no LinkedIn URL
    preferred_channel = "linkedin" if linkedin_url else "email"

    return Persona(
        company_name=company_name,
        full_name=full_name,
        job_title=job_title,
        linkedin_url=linkedin_url or None,
        email=email,
        phone=phone,
        persona_type=persona_type,
        recent_activity=recent_activity,
        last_job_change=last_job_change,
        preferred_channel=preferred_channel,
    )


def _classify_persona(title: str) -> str:
    title_lower = title.lower()
    for dm in DECISION_MAKER_TITLES:
        if dm.lower() in title_lower:
            return "decision_maker"
    for ch in CHAMPION_TITLES:
        if ch.lower() in title_lower:
            return "champion"
    for inf in INFLUENCER_TITLES:
        if inf.lower() in title_lower:
            return "influencer"
    return "influencer"
