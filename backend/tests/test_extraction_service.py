from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

from app.integrations.claude_llm import ExtractionResult
from app.models.company import Company
from app.models.extraction_prompt import ExtractionPrompt
from app.models.profile import SearchProfile, SearchTerm
from app.models.vacancy import Vacancy
from app.services.extraction import ExtractionService, compute_extraction_quality


# SQLite doesn't support JSONB
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


def test_compute_extraction_quality_all_fields():
    schema = {
        "erp_systems": "ERP?",
        "team_size": "Team?",
        "volume_indicators": "Volume?",
    }
    extracted = {
        "erp_systems": ["SAP"],
        "team_size": "5 people",
        "volume_indicators": "10000 invoices/year",
    }
    quality = compute_extraction_quality(extracted, schema)
    assert quality == 1.0


def test_compute_extraction_quality_partial():
    schema = {
        "erp_systems": "ERP?",
        "team_size": "Team?",
        "volume_indicators": "Volume?",
        "p2p_tools": "P2P?",
    }
    extracted = {
        "erp_systems": ["SAP"],
        "team_size": None,
        "volume_indicators": "10000 invoices/year",
        "p2p_tools": None,
    }
    quality = compute_extraction_quality(extracted, schema)
    assert quality == 0.5


def test_compute_extraction_quality_empty():
    schema = {"erp_systems": "ERP?", "team_size": "Team?"}
    extracted = {"erp_systems": None, "team_size": None}
    quality = compute_extraction_quality(extracted, schema)
    assert quality == 0.0


@pytest.mark.asyncio
async def test_extract_vacancies_for_profile(db_session):
    # Set up profile with extraction prompt
    profile = SearchProfile(
        name="AP",
        slug="ap",
        search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ],
    )
    db_session.add(profile)
    await db_session.flush()

    prompt = ExtractionPrompt(
        profile_id=profile.id,
        version=1,
        system_prompt="Extract data.",
        extraction_schema={
            "erp_systems": "ERP?",
            "team_size": "Team?",
        },
        is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    # Add a company and vacancies
    company = Company(name="Acme B.V.", normalized_name="acme")
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme B.V.",
        job_title="AP Medewerker",
        raw_text="Wij zoeken een AP medewerker met SAP ervaring. Team van 5.",
        extraction_status="pending",
    )
    db_session.add(vacancy)
    await db_session.flush()

    mock_result = ExtractionResult(
        extracted_data={"erp_systems": ["SAP"], "team_size": "5"},
        tokens_input=300,
        tokens_output=100,
        model="claude-sonnet-4-20250514",
        success=True,
    )

    service = ExtractionService(db=db_session)

    with patch.object(service, "_llm_client", create=True) as mock_client:
        mock_client.extract_vacancy_data = AsyncMock(return_value=mock_result)
        run = await service.run_llm_extraction(profile_id=profile.id)

    assert run.status == "completed"
    assert run.items_processed == 1
    assert run.items_succeeded == 1
    assert run.tokens_input == 300
    assert run.tokens_output == 100

    # Verify vacancy was updated
    await db_session.refresh(vacancy)
    assert vacancy.extraction_status == "completed"
    assert vacancy.extracted_data is not None
    assert "SAP" in vacancy.extracted_data["erp_systems"]


@pytest.mark.asyncio
async def test_extract_skips_already_extracted(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    prompt = ExtractionPrompt(
        profile_id=profile.id,
        version=1,
        system_prompt="Extract.",
        extraction_schema={"erp": "ERP?"},
        is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    company = Company(name="Acme", normalized_name="acme")
    db_session.add(company)
    await db_session.flush()

    # Already extracted vacancy
    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme",
        job_title="AP",
        raw_text="Some text",
        extraction_status="completed",
        extracted_data={"erp": ["SAP"]},
    )
    db_session.add(vacancy)
    await db_session.flush()

    service = ExtractionService(db=db_session)
    run = await service.run_llm_extraction(profile_id=profile.id)

    assert run.items_processed == 0  # Nothing to extract


@pytest.mark.asyncio
async def test_extract_handles_llm_failure(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    prompt = ExtractionPrompt(
        profile_id=profile.id,
        version=1,
        system_prompt="Extract.",
        extraction_schema={"erp": "ERP?"},
        is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    company = Company(name="Acme", normalized_name="acme")
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme",
        job_title="AP",
        raw_text="Some text",
        extraction_status="pending",
    )
    db_session.add(vacancy)
    await db_session.flush()

    mock_result = ExtractionResult(
        success=False,
        error="API timeout",
        model="claude-sonnet-4-20250514",
    )

    service = ExtractionService(db=db_session)
    with patch.object(service, "_llm_client", create=True) as mock_client:
        mock_client.extract_vacancy_data = AsyncMock(return_value=mock_result)
        run = await service.run_llm_extraction(profile_id=profile.id)

    assert run.items_processed == 1
    assert run.items_failed == 1

    await db_session.refresh(vacancy)
    assert vacancy.extraction_status == "failed"
