import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company

logger = logging.getLogger(__name__)

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


async def merge_companies_by_kvk(db: AsyncSession) -> int:
    """Find companies that share a KvK number and merge them.

    The oldest company record survives.
    Data from newer records is merged in (fill nulls from other records).
    All vacancies from merged records are reassigned to the survivor.
    The merged records are then deleted.

    Returns the number of merges performed.
    """
    from sqlalchemy import func as sa_func

    from app.models.vacancy import Vacancy

    # Find KvK numbers with multiple company records
    result = await db.execute(
        select(Company.kvk_number)
        .where(Company.kvk_number.isnot(None))
        .group_by(Company.kvk_number)
        .having(sa_func.count(Company.id) > 1)
    )
    duplicate_kvk_numbers = [row[0] for row in result.all()]

    merge_count = 0
    for kvk_number in duplicate_kvk_numbers:
        result = await db.execute(
            select(Company)
            .where(Company.kvk_number == kvk_number)
            .order_by(Company.created_at)
        )
        companies = list(result.scalars().all())

        if len(companies) < 2:
            continue

        # Survivor is the oldest record (first created)
        survivor = companies[0]

        for duplicate in companies[1:]:
            # Merge data: fill nulls on survivor from duplicate
            _merge_company_data(survivor, duplicate)

            # Reassign all vacancies from duplicate to survivor
            result = await db.execute(
                select(Vacancy).where(Vacancy.company_id == duplicate.id)
            )
            vacancies = result.scalars().all()
            for v in vacancies:
                v.company_id = survivor.id

            # Delete duplicate
            await db.delete(duplicate)
            merge_count += 1

    await db.commit()
    logger.info("Merged %d duplicate company records by KvK number.", merge_count)
    return merge_count


def _merge_company_data(survivor: Company, duplicate: Company) -> None:
    """Merge fields from duplicate into survivor, keeping non-null values."""
    fields_to_merge = [
        "sbi_codes",
        "employee_range",
        "revenue_range",
        "entity_count",
        "enrichment_data",
        "kvk_data",
        "company_info_data",
    ]
    for field_name in fields_to_merge:
        survivor_val = getattr(survivor, field_name, None)
        duplicate_val = getattr(duplicate, field_name, None)
        if survivor_val is None and duplicate_val is not None:
            setattr(survivor, field_name, duplicate_val)
