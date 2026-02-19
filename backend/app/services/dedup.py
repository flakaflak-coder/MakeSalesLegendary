import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company

# Legal suffixes to strip (Dutch + international)
_LEGAL_SUFFIXES = re.compile(
    r"\b(b\.?v\.?|n\.?v\.?|gmbh|ltd\.?|inc\.?|llc|s\.?a\.?|s\.?r\.?l\.?)\s*$",
    re.IGNORECASE,
)

# Characters to normalize
_NOISE_CHARS = re.compile(r"[&\-.,/\\|()\"']")


def normalize_company_name(name: str) -> str:
    """Normalize a company name for deduplication matching."""
    name = name.strip()
    if not name:
        return ""

    # Lowercase
    name = name.lower()
    # Remove legal suffixes
    name = _LEGAL_SUFFIXES.sub("", name)
    # Replace noise characters with space
    name = _NOISE_CHARS.sub(" ", name)
    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()

    return name


async def find_or_create_company(db: AsyncSession, raw_company_name: str) -> Company:
    """Find an existing company by normalized name, or create a new one."""
    normalized = normalize_company_name(raw_company_name)

    result = await db.execute(
        select(Company).where(Company.normalized_name == normalized)
    )
    company = result.scalar_one_or_none()

    if company:
        return company

    company = Company(name=raw_company_name, normalized_name=normalized)
    db.add(company)
    await db.flush()
    return company
