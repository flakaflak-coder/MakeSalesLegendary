from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

from app.models.company import Company
from app.models.enrichment import EnrichmentRun
from app.models.extraction_prompt import ExtractionPrompt
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.services.enrichment import EnrichmentOrchestrator


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@pytest.mark.asyncio
async def test_orchestrate_both_passes(db_session):
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

    company = Company(name="Acme", normalized_name="acme", enrichment_status="pending")
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme",
        job_title="AP",
        raw_text="We use SAP.",
        extraction_status="pending",
    )
    db_session.add(vacancy)
    await db_session.flush()

    mock_llm_run = MagicMock(spec=EnrichmentRun)
    mock_llm_run.status = "completed"
    mock_llm_run.items_succeeded = 1

    mock_ext_run = MagicMock(spec=EnrichmentRun)
    mock_ext_run.status = "completed"
    mock_ext_run.items_succeeded = 1

    orchestrator = EnrichmentOrchestrator(db=db_session)

    with (
        patch.object(
            orchestrator._extraction_service,
            "run_llm_extraction",
            new_callable=AsyncMock,
            return_value=mock_llm_run,
        ),
        patch.object(
            orchestrator,
            "_update_company_quality_scores",
            new_callable=AsyncMock,
        ),
        patch.object(
            orchestrator._external_service,
            "run_external_enrichment",
            new_callable=AsyncMock,
            return_value=mock_ext_run,
        ),
    ):
        result = await orchestrator.run_full_enrichment(profile_id=profile.id)

    assert result["llm_run"].status == "completed"
    assert result["external_run"].status == "completed"


@pytest.mark.asyncio
async def test_orchestrate_llm_only(db_session):
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

    mock_llm_run = MagicMock(spec=EnrichmentRun)
    mock_llm_run.status = "completed"

    orchestrator = EnrichmentOrchestrator(db=db_session)

    with patch.object(
        orchestrator._extraction_service,
        "run_llm_extraction",
        new_callable=AsyncMock,
        return_value=mock_llm_run,
    ):
        result = await orchestrator.run_full_enrichment(
            profile_id=profile.id, pass_type="llm"
        )

    assert result["llm_run"].status == "completed"
    assert result.get("external_run") is None


@pytest.mark.asyncio
async def test_update_company_quality_scores(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    company = Company(name="Acme", normalized_name="acme", enrichment_status="pending")
    db_session.add(company)
    await db_session.flush()

    # Two vacancies for same company -- one good extraction, one partial
    v1 = Vacancy(
        external_id="v1",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme",
        job_title="AP 1",
        raw_text="Text",
        extraction_status="completed",
        extracted_data={"erp": ["SAP"], "team": "5"},
    )
    v2 = Vacancy(
        external_id="v2",
        source="google_jobs",
        search_profile_id=profile.id,
        company_id=company.id,
        company_name_raw="Acme",
        job_title="AP 2",
        raw_text="Text",
        extraction_status="completed",
        extracted_data={"erp": None, "team": "3"},
    )
    db_session.add_all([v1, v2])
    await db_session.flush()

    prompt = ExtractionPrompt(
        profile_id=profile.id,
        version=1,
        system_prompt="Extract.",
        extraction_schema={"erp": "ERP?", "team": "Team?"},
        is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    orchestrator = EnrichmentOrchestrator(db=db_session)
    await orchestrator._update_company_quality_scores(profile_id=profile.id)

    await db_session.refresh(company)
    # v1 quality: 2/2 = 1.0, v2 quality: 1/2 = 0.5, average = 0.75
    assert company.extraction_quality == 0.75
