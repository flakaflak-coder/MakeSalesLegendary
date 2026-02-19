"""Integration test: full pipeline from profile creation to stored vacancies."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.vacancy import Vacancy
from app.scrapers.serpapi import SerpApiResult

MOCK_RESULTS = [
    SerpApiResult(
        external_id="gj_001",
        job_title="Crediteurenadministrateur",
        company_name="Acme B.V.",
        location="Amsterdam",
        description="Wij zoeken een crediteurenadministrateur met ervaring in SAP.",
        job_url="https://example.com/1",
        source="google_jobs",
    ),
    SerpApiResult(
        external_id="gj_002",
        job_title="AP Medewerker",
        company_name="Acme BV",  # Same company, different format
        location="Amsterdam",
        description="AP medewerker voor druk team.",
        job_url="https://example.com/2",
        source="google_jobs",
    ),
    SerpApiResult(
        external_id="gj_003",
        job_title="Accounts Payable Specialist",
        company_name="Globex Corporation N.V.",
        location="Rotterdam",
        description="International AP specialist needed.",
        job_url="https://example.com/3",
        source="google_jobs",
    ),
]


@pytest.mark.asyncio
async def test_full_pipeline(client: AsyncClient, db_session: AsyncSession):
    # 1. Create a search profile via API
    response = await client.post(
        "/api/profiles",
        json={
            "name": "Accounts Payable",
            "slug": "ap",
            "description": "AP leads",
            "search_terms": [
                {
                    "term": "crediteurenadministratie",
                    "language": "nl",
                    "priority": "primary",
                },
                {
                    "term": "accounts payable",
                    "language": "en",
                    "priority": "primary",
                },
            ],
        },
    )
    assert response.status_code == 201
    profile_id = response.json()["id"]

    # 2. Verify profile exists
    response = await client.get(f"/api/profiles/{profile_id}")
    assert response.status_code == 200
    assert response.json()["slug"] == "ap"

    # 3. Run harvest directly (bypass Celery for integration test)
    from app.services.harvester import HarvestService

    service = HarvestService(db=db_session)
    with patch.object(
        service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=MOCK_RESULTS,
    ):
        run = await service.run_harvest(profile_id=profile_id, source="google_jobs")

    assert run.status == "completed"
    assert run.vacancies_found == 3
    assert run.vacancies_new == 3

    # 4. Verify company deduplication: "Acme B.V." and "Acme BV" -> same company
    company_count = await db_session.scalar(select(func.count(Company.id)))
    assert company_count == 2  # Acme + Globex

    # 5. Verify all vacancies stored
    vacancy_count = await db_session.scalar(select(func.count(Vacancy.id)))
    assert vacancy_count == 3

    # 6. Verify vacancy-company linkage
    acme_vacancies = await db_session.execute(
        select(Vacancy).join(Company).where(Company.normalized_name == "acme")
    )
    assert len(acme_vacancies.scalars().all()) == 2

    # 7. Run harvest again — should find 0 new (dedup)
    with patch.object(
        service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=MOCK_RESULTS,
    ):
        run2 = await service.run_harvest(profile_id=profile_id, source="google_jobs")

    assert run2.vacancies_found == 3
    assert run2.vacancies_new == 0

    # 8. Verify harvest runs via API
    response = await client.get("/api/harvest/runs")
    assert response.status_code == 200
    runs = response.json()
    assert len(runs) == 2  # Two harvest runs created
    # Most recent run first (ordered by id desc)
    assert runs[0]["vacancies_new"] == 0
    assert runs[1]["vacancies_new"] == 3
