import logging
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.profile import SearchProfile, SearchTerm

logger = logging.getLogger(__name__)

PROFILES_DIR = Path(__file__).resolve().parent.parent.parent / "profiles"


def load_profile_yaml(profile_name: str) -> dict:
    """Load a profile YAML file by name."""
    path = PROFILES_DIR / f"{profile_name}.yaml"
    with open(path) as f:
        return yaml.safe_load(f)


async def seed_profile(db: AsyncSession, profile_name: str) -> SearchProfile:
    """Seed a search profile from YAML. Idempotent -- skips if slug exists."""
    data = load_profile_yaml(profile_name)
    profile_data = data["profile"]

    result = await db.execute(
        select(SearchProfile)
        .where(SearchProfile.slug == profile_data["slug"])
        .options(selectinload(SearchProfile.search_terms))
    )
    existing = result.scalar_one_or_none()
    if existing:
        logger.info("Profile '%s' already exists, skipping seed.", profile_data["slug"])
        return existing

    terms: list[SearchTerm] = []
    for priority, term_list in profile_data["search_terms"].items():
        for entry in term_list:
            terms.append(
                SearchTerm(
                    term=entry["term"],
                    language=entry.get("language", "nl"),
                    priority=priority,
                    category="job_title",
                )
            )

    profile = SearchProfile(
        name=profile_data["name"],
        slug=profile_data["slug"],
        description=profile_data.get("description"),
        search_terms=terms,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile, ["search_terms"])

    logger.info("Seeded profile '%s' with %d search terms.", profile.slug, len(terms))
    return profile
