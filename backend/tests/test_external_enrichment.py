from unittest.mock import AsyncMock, patch

import pytest

from app.integrations.apollo import ApolloCompanyData
from app.integrations.kvk import KvKCompanyData
from app.models.company import Company
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.services.external_enrichment import ExternalEnrichmentService


@pytest.mark.asyncio
async def test_enrich_qualifying_companies(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    company = Company(
        name="Acme B.V.",
        normalized_name="acme",
        enrichment_status="pending",
        extraction_quality=0.6,  # Above threshold
    )
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme B.V.",
        job_title="AP",
        raw_text="Text",
        extraction_status="completed",
        extracted_data={"erp_systems": ["SAP"]},
    )
    db_session.add(vacancy)
    await db_session.flush()

    mock_kvk = KvKCompanyData(
        kvk_number="12345678",
        name="Acme B.V.",
        sbi_codes=[{"code": "6201", "description": "Software"}],
        employee_count=150,
        entity_count=3,
    )
    mock_apollo = ApolloCompanyData(
        name="Acme B.V.",
        employee_count=150,
        employee_range="100-199",
        revenue_range="10M-50M",
        apollo_id="org_abc123",
        raw_data={"id": "org_abc123", "name": "Acme B.V."},
    )

    service = ExternalEnrichmentService(db=db_session)

    with (
        patch.object(service, "_kvk_client", create=True) as mock_kvk_client,
        patch.object(service, "_apollo_client", create=True) as mock_apollo_client,
    ):
        mock_kvk_client.find_kvk_number = AsyncMock(return_value="12345678")
        mock_kvk_client.get_company_profile = AsyncMock(return_value=mock_kvk)
        mock_apollo_client.enrich_company = AsyncMock(return_value=mock_apollo)

        run = await service.run_external_enrichment(profile_id=profile.id)

    assert run.status == "completed"
    assert run.items_processed == 1
    assert run.items_succeeded == 1

    await db_session.refresh(company)
    assert company.kvk_number == "12345678"
    assert company.sbi_codes == [{"code": "6201", "description": "Software"}]
    assert company.employee_range == "100-199"
    assert company.entity_count == 3
    assert company.enrichment_status == "completed"
    assert company.enriched_at is not None


@pytest.mark.asyncio
async def test_skip_companies_below_threshold(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    company = Company(
        name="Small Co",
        normalized_name="small co",
        enrichment_status="pending",
        extraction_quality=0.1,  # Below threshold
    )
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Small Co",
        job_title="AP",
        raw_text="Text",
        extraction_status="completed",
    )
    db_session.add(vacancy)
    await db_session.flush()

    service = ExternalEnrichmentService(db=db_session)
    run = await service.run_external_enrichment(profile_id=profile.id)

    assert run.items_processed == 0  # Company below threshold, skipped


@pytest.mark.asyncio
async def test_skip_already_enriched_companies(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    company = Company(
        name="Acme B.V.",
        normalized_name="acme",
        enrichment_status="completed",  # Already done
        extraction_quality=0.8,
    )
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme B.V.",
        job_title="AP",
        raw_text="Text",
        extraction_status="completed",
    )
    db_session.add(vacancy)
    await db_session.flush()

    service = ExternalEnrichmentService(db=db_session)
    run = await service.run_external_enrichment(profile_id=profile.id)

    assert run.items_processed == 0


@pytest.mark.asyncio
async def test_enrich_handles_kvk_failure(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    company = Company(
        name="Acme B.V.",
        normalized_name="acme",
        enrichment_status="pending",
        extraction_quality=0.6,
    )
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme B.V.",
        job_title="AP",
        raw_text="Text",
        extraction_status="completed",
    )
    db_session.add(vacancy)
    await db_session.flush()

    service = ExternalEnrichmentService(db=db_session)
    with (
        patch.object(service, "_kvk_client", create=True) as mock_kvk_client,
        patch.object(service, "_apollo_client", create=True) as mock_apollo_client,
    ):
        mock_kvk_client.find_kvk_number = AsyncMock(return_value=None)
        mock_apollo_client.enrich_company = AsyncMock(return_value=None)

        run = await service.run_external_enrichment(profile_id=profile.id)

    # Partial failure -- KvK not found, but run still completes
    assert run.status == "completed"
    assert run.items_processed == 1
    # Company is enriched with whatever we got (nothing in this case)
    await db_session.refresh(company)
    assert company.enrichment_status == "completed"
