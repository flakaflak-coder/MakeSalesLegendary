"""Integration test: full pipeline from harvest through enrichment."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles

from app.integrations.claude_llm import ExtractionResult
from app.integrations.company_info import CompanyFinancialData
from app.integrations.kvk import KvKCompanyData
from app.models.company import Company
from app.scrapers.serpapi import SerpApiResult


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


MOCK_HARVEST_RESULTS = [
    SerpApiResult(
        external_id="gj_101",
        job_title="Crediteurenadministrateur",
        company_name="TechCorp B.V.",
        location="Amsterdam",
        description=(
            "Wij zoeken een ervaren crediteurenadministrateur. "
            "Je werkt met SAP en verwerkt dagelijks circa 200 facturen. "
            "Ons team bestaat uit 8 medewerkers. "
            "Wij zijn actief in 4 landen."
        ),
        job_url="https://example.com/101",
        source="google_jobs",
    ),
    SerpApiResult(
        external_id="gj_102",
        job_title="AP Medewerker",
        company_name="TechCorp BV",  # Same company, different format
        location="Amsterdam",
        description=("AP medewerker gezocht voor druk team met Exact Online."),
        job_url="https://example.com/102",
        source="google_jobs",
    ),
    SerpApiResult(
        external_id="gj_103",
        job_title="Accounts Payable Specialist",
        company_name="MiniStartup",
        location="Rotterdam",
        description="Simple AP role, no specific tools mentioned.",
        job_url="https://example.com/103",
        source="google_jobs",
    ),
]


@pytest.mark.asyncio
async def test_full_harvest_to_enrichment_pipeline(
    client: AsyncClient, db_session: AsyncSession
):
    # 1. Create profile with extraction prompt
    response = await client.post(
        "/api/profiles",
        json={
            "name": "Accounts Payable",
            "slug": "ap",
            "search_terms": [
                {"term": "accounts payable", "language": "en", "priority": "primary"},
            ],
        },
    )
    assert response.status_code == 201
    profile_id = response.json()["id"]

    # Create extraction prompt
    response = await client.post(
        f"/api/enrichment/profiles/{profile_id}/prompts",
        json={
            "system_prompt": (
                "Extract structured data from Dutch/English vacancy texts."
            ),
            "extraction_schema": {
                "erp_systems": "Which ERP systems are mentioned?",
                "team_size": "Any indication of team size?",
                "volume_indicators": "Invoice volumes or transaction counts?",
                "complexity_signals": "International operations?",
            },
        },
    )
    assert response.status_code == 201

    # 2. Run harvest (mocked)
    from app.services.harvester import HarvestService

    harvest_service = HarvestService(db=db_session)
    with patch.object(
        harvest_service,
        "_search_source",
        new_callable=AsyncMock,
        return_value=MOCK_HARVEST_RESULTS,
    ):
        harvest_run = await harvest_service.run_harvest(
            profile_id=profile_id, source="google_jobs"
        )

    assert harvest_run.vacancies_new == 3

    # Verify company dedup: TechCorp B.V. and TechCorp BV = same company
    company_count = await db_session.scalar(select(func.count(Company.id)))
    assert company_count == 2  # TechCorp + MiniStartup

    # 3. Run Pass 1: LLM extraction (mocked)
    from app.services.enrichment import EnrichmentOrchestrator

    # Mock LLM responses for each vacancy
    mock_extractions = {
        "gj_101": ExtractionResult(
            extracted_data={
                "erp_systems": ["SAP"],
                "team_size": "8 medewerkers",
                "volume_indicators": "200 facturen per dag",
                "complexity_signals": "4 landen",
            },
            tokens_input=400,
            tokens_output=150,
            model="claude-sonnet-4-20250514",
            success=True,
        ),
        "gj_102": ExtractionResult(
            extracted_data={
                "erp_systems": ["Exact Online"],
                "team_size": None,
                "volume_indicators": None,
                "complexity_signals": None,
            },
            tokens_input=200,
            tokens_output=100,
            model="claude-sonnet-4-20250514",
            success=True,
        ),
        "gj_103": ExtractionResult(
            extracted_data={
                "erp_systems": None,
                "team_size": None,
                "volume_indicators": None,
                "complexity_signals": None,
            },
            tokens_input=150,
            tokens_output=80,
            model="claude-sonnet-4-20250514",
            success=True,
        ),
    }

    async def mock_extract(vacancy_text, extraction_schema, system_prompt):
        # Match by looking for keywords in the vacancy text
        if "SAP" in vacancy_text:
            return mock_extractions["gj_101"]
        elif "Exact Online" in vacancy_text:
            return mock_extractions["gj_102"]
        else:
            return mock_extractions["gj_103"]

    orchestrator = EnrichmentOrchestrator(db=db_session)

    with patch.object(
        orchestrator._extraction_service._llm_client,
        "extract_vacancy_data",
        side_effect=mock_extract,
    ):
        result = await orchestrator.run_full_enrichment(
            profile_id=profile_id, pass_type="llm"
        )

    assert result["llm_run"].status == "completed"
    assert result["llm_run"].items_succeeded == 3

    # Verify extraction quality scores
    techcorp = await db_session.execute(
        select(Company).where(Company.normalized_name == "techcorp")
    )
    techcorp_company = techcorp.scalar_one()
    # gj_101: 4/4 = 1.0, gj_102: 1/4 = 0.25, average = 0.625
    assert techcorp_company.extraction_quality == 0.625

    ministartup = await db_session.execute(
        select(Company).where(Company.normalized_name == "ministartup")
    )
    ministartup_company = ministartup.scalar_one()
    # gj_103: 0/4 = 0.0
    assert ministartup_company.extraction_quality == 0.0

    # 4. Run Pass 2: External enrichment (mocked)
    mock_kvk = KvKCompanyData(
        kvk_number="12345678",
        name="TechCorp B.V.",
        sbi_codes=[{"code": "6201", "description": "Software"}],
        employee_count=150,
        entity_count=4,
    )
    mock_ci = CompanyFinancialData(
        kvk_number="12345678",
        employee_count=150,
        employee_range="100-199",
        revenue_range="10M-50M",
    )

    with (
        patch.object(
            orchestrator._external_service._kvk_client,
            "find_kvk_number",
            new_callable=AsyncMock,
            return_value="12345678",
        ),
        patch.object(
            orchestrator._external_service._kvk_client,
            "get_company_profile",
            new_callable=AsyncMock,
            return_value=mock_kvk,
        ),
        patch.object(
            orchestrator._external_service._company_info_client,
            "get_company_data",
            new_callable=AsyncMock,
            return_value=mock_ci,
        ),
    ):
        result = await orchestrator.run_full_enrichment(
            profile_id=profile_id, pass_type="external"
        )

    ext_run = result["external_run"]
    assert ext_run.status == "completed"
    # Only TechCorp qualifies (quality 0.625 > 0.3 threshold)
    # MiniStartup has quality 0.0, below threshold
    assert ext_run.items_processed == 1
    assert ext_run.items_succeeded == 1

    # Verify TechCorp is enriched
    await db_session.refresh(techcorp_company)
    assert techcorp_company.kvk_number == "12345678"
    assert techcorp_company.sbi_codes == [{"code": "6201", "description": "Software"}]
    assert techcorp_company.employee_range == "100-199"
    assert techcorp_company.entity_count == 4
    assert techcorp_company.enrichment_status == "completed"

    # Verify MiniStartup was NOT enriched
    await db_session.refresh(ministartup_company)
    assert ministartup_company.enrichment_status == "pending"

    # 5. Verify enrichment runs via API
    response = await client.get("/api/enrichment/runs")
    assert response.status_code == 200
    runs = response.json()
    assert len(runs) >= 2  # At least the LLM and external runs
