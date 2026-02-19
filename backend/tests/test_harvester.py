from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select

from app.models.company import Company
from app.scrapers.serpapi import SerpApiResult
from app.services.harvester import HarvestService


def _make_serpapi_results() -> list[SerpApiResult]:
    return [
        SerpApiResult(
            external_id="job1",
            job_title="AP Medewerker",
            company_name="Acme B.V.",
            location="Amsterdam",
            description="Looking for AP specialist",
            job_url="https://example.com/1",
            source="google_jobs",
        ),
        SerpApiResult(
            external_id="job2",
            job_title="Crediteurenadministrateur",
            company_name="Acme B.V.",
            location="Amsterdam",
            description="Experienced crediteurenadministrateur needed",
            job_url="https://example.com/2",
            source="google_jobs",
        ),
        SerpApiResult(
            external_id="job3",
            job_title="Accounts Payable Specialist",
            company_name="Globex Corp",
            location="Rotterdam",
            description="AP specialist for international team",
            job_url="https://example.com/3",
            source="google_jobs",
        ),
    ]


@pytest.mark.asyncio
async def test_harvest_creates_run_record(db_session):
    service = HarvestService(db=db_session)
    from app.models.profile import SearchProfile, SearchTerm

    profile = SearchProfile(
        name="AP",
        slug="ap",
        search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ],
    )
    db_session.add(profile)
    await db_session.flush()

    with patch.object(
        service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=_make_serpapi_results(),
    ):
        run = await service.run_harvest(profile_id=profile.id, source="google_jobs")

    assert run.status == "completed"
    assert run.vacancies_found == 3
    assert run.vacancies_new == 3


@pytest.mark.asyncio
async def test_harvest_deduplicates_companies(db_session):
    service = HarvestService(db=db_session)
    from app.models.profile import SearchProfile, SearchTerm

    profile = SearchProfile(
        name="AP",
        slug="ap",
        search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ],
    )
    db_session.add(profile)
    await db_session.flush()

    with patch.object(
        service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=_make_serpapi_results(),
    ):
        await service.run_harvest(profile_id=profile.id, source="google_jobs")

    count = await db_session.scalar(select(func.count(Company.id)))
    assert count == 2  # Acme + Globex


@pytest.mark.asyncio
async def test_harvest_skips_duplicate_vacancies(db_session):
    service = HarvestService(db=db_session)
    from app.models.profile import SearchProfile, SearchTerm

    profile = SearchProfile(
        name="AP",
        slug="ap",
        search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ],
    )
    db_session.add(profile)
    await db_session.flush()

    results = _make_serpapi_results()

    with patch.object(
        service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=results,
    ):
        await service.run_harvest(profile_id=profile.id, source="google_jobs")

    with patch.object(
        service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=results,
    ):
        run2 = await service.run_harvest(profile_id=profile.id, source="google_jobs")

    assert run2.vacancies_found == 3
    assert run2.vacancies_new == 0
