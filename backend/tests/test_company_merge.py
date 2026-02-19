import pytest
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

from app.models.company import Company
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.services.dedup import merge_companies_by_kvk


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@pytest.fixture
async def _allow_duplicate_kvk(db_session):
    """Drop the unique index on kvk_number so we can insert test duplicates.

    In production (Postgres), duplicates can arise from race conditions
    during enrichment or before the constraint is applied to legacy data.
    """
    await db_session.execute(text("DROP INDEX IF EXISTS ix_companies_kvk_number"))
    await db_session.commit()


@pytest.mark.asyncio
@pytest.mark.usefixtures("_allow_duplicate_kvk")
async def test_merge_companies_with_same_kvk(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    c1 = Company(
        name="Acme B.V.",
        normalized_name="acme",
        kvk_number="12345678",
        employee_range="100-199",
    )
    c2 = Company(
        name="Acme Holding",
        normalized_name="acme holding",
        kvk_number="12345678",
        employee_range=None,
    )
    db_session.add_all([c1, c2])
    await db_session.flush()

    v1 = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=c1.id,
        company_name_raw="Acme B.V.",
        job_title="AP 1",
        raw_text="Text",
    )
    v2 = Vacancy(
        external_id="v2",
        source="indeed",
        search_profile_id=profile.id,
        company_id=c2.id,
        company_name_raw="Acme Holding",
        job_title="AP 2",
        raw_text="Text",
    )
    db_session.add_all([v1, v2])
    await db_session.flush()

    merged_count = await merge_companies_by_kvk(db_session)
    assert merged_count == 1  # One merge happened

    # Verify: only one company remains with KvK 12345678
    result = await db_session.execute(
        select(Company).where(Company.kvk_number == "12345678")
    )
    companies = result.scalars().all()
    assert len(companies) == 1

    # Verify: both vacancies point to the surviving company
    result = await db_session.execute(
        select(func.count(Vacancy.id)).where(Vacancy.company_id == companies[0].id)
    )
    assert result.scalar() == 2


@pytest.mark.asyncio
@pytest.mark.usefixtures("_allow_duplicate_kvk")
async def test_merge_keeps_richest_data(db_session):
    c1 = Company(
        name="Acme B.V.",
        normalized_name="acme",
        kvk_number="12345678",
        employee_range="100-199",
        sbi_codes=[{"code": "6201"}],
        entity_count=3,
    )
    c2 = Company(
        name="Acme Holding",
        normalized_name="acme holding",
        kvk_number="12345678",
        employee_range=None,
        revenue_range="10M-50M",
    )
    db_session.add_all([c1, c2])
    await db_session.flush()

    await merge_companies_by_kvk(db_session)

    result = await db_session.execute(
        select(Company).where(Company.kvk_number == "12345678")
    )
    surviving = result.scalar_one()
    # Should have data from both records
    assert surviving.employee_range == "100-199"
    assert surviving.revenue_range == "10M-50M"
    assert surviving.entity_count == 3


@pytest.mark.asyncio
async def test_no_merge_needed(db_session):
    c1 = Company(name="Acme", normalized_name="acme", kvk_number="11111111")
    c2 = Company(name="Globex", normalized_name="globex", kvk_number="22222222")
    db_session.add_all([c1, c2])
    await db_session.flush()

    merged_count = await merge_companies_by_kvk(db_session)
    assert merged_count == 0
