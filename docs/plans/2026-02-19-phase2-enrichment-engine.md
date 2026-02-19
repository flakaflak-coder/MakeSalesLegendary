# Phase 2: Enrichment Engine -- Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the two-pass enrichment engine -- first extract structured data from vacancy text using Claude LLM, then enrich qualifying companies with external business data from KvK and Company.info. Add extraction prompt configuration per profile, an enrichment run tracker, and a Celery-based enrichment pipeline that runs automatically after each harvest.

**Depends on:** Phase 1 (Harvesting MVP) -- all models, services, and infrastructure must be in place.

**Architecture:** Enrichment is two-pass by design. Pass 1 (LLM extraction) runs against every vacancy with `raw_text` that has not yet been extracted. It is cheap and fast. Pass 2 (external API enrichment) runs only against companies that pass a configurable minimum extraction quality threshold, because it costs money and is rate-limited. Both passes are orchestrated by an `EnrichmentService` and executed as Celery tasks.

**Tech Stack additions:** anthropic Python SDK (Claude API), httpx for KvK + Company.info REST APIs.

---

## Dependency Graph & Parallelism

```
SEQUENTIAL FOUNDATION (Tasks 1-3)
  Task 1: New dependencies (anthropic SDK, etc.)
  Task 2: Extraction prompt model + migration
  Task 3: Enrichment run tracking model + migration

PARALLEL BLOCK A (Tasks 4-7, all independent after Task 3)
  Task 4: Claude LLM integration client + tests               ─┐
  Task 5: KvK API integration client + tests                   ─┤── all run in parallel
  Task 6: Company.info API integration client + tests          ─┤
  Task 7: Extraction prompt YAML + seed + CRUD API + tests     ─┘

PARALLEL BLOCK B (Tasks 8-9, after Block A)
  Task 8: LLM extraction service (Pass 1) + tests             ─┐── parallel
  Task 9: External enrichment service (Pass 2) + tests        ─┘

SEQUENTIAL (Task 10, after Block B)
  Task 10: Enrichment orchestration service + tests

PARALLEL BLOCK C (Tasks 11-12, after Task 10)
  Task 11: Enrichment API endpoints + tests                   ─┐── parallel
  Task 12: Celery enrichment tasks + auto-trigger after harvest─┘

SEQUENTIAL FINISH (Tasks 13-14, after Block C)
  Task 13: Company dedup merging (KvK-based) + tests
  Task 14: Integration test -- full harvest-to-enrichment pipeline
```

---

## Task 1: Add New Dependencies

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/.env.example`
- Modify: `backend/app/config.py`

**Step 1: Add anthropic SDK and update pyproject.toml**

Add `anthropic` to the `dependencies` list in `backend/pyproject.toml`:

```toml
dependencies = [
    # ... existing dependencies ...
    "anthropic>=0.42,<1",
]
```

**Step 2: Add Company.info API key to config**

Update `backend/app/config.py` to add the new setting:

```python
class Settings(BaseSettings):
    # ... existing settings ...
    company_info_api_key: str = ""
    enrichment_llm_model: str = "claude-sonnet-4-20250514"
    enrichment_min_quality_threshold: float = 0.3  # minimum extraction quality for Pass 2
    kvk_api_base_url: str = "https://api.kvk.nl/api/v2"
    company_info_api_base_url: str = "https://api.companyinfo.nl"
```

**Step 3: Update .env.example**

Add:
```
COMPANY_INFO_API_KEY=
ENRICHMENT_LLM_MODEL=claude-sonnet-4-20250514
ENRICHMENT_MIN_QUALITY_THRESHOLD=0.3
```

**Step 4: Reinstall dependencies**

Run: `cd backend && pip install -e ".[dev]"`
Expected: Installs `anthropic` without errors.

**Step 5: Verify import**

Run: `cd backend && python -c "import anthropic; print(anthropic.__version__)"`
Expected: Prints version number.

**Step 6: Commit**

```bash
git add backend/pyproject.toml backend/app/config.py backend/.env.example
git commit -m "deps: add anthropic SDK and Company.info config for enrichment"
```

---

## Task 2: Extraction Prompt Model + Migration

**Files:**
- Create: `backend/app/models/extraction_prompt.py`
- Modify: `backend/app/models/__init__.py`

**Step 1: Create the extraction prompt model**

This model stores versioned LLM prompts per profile. Each profile has one active prompt version at a time, but old versions are retained for auditing and the feedback loop.

```python
# backend/app/models/extraction_prompt.py
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExtractionPrompt(Base):
    __tablename__ = "extraction_prompts"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    system_prompt: Mapped[str] = mapped_column(Text)
    extraction_schema: Mapped[dict] = mapped_column(JSONB)
    # extraction_schema stores the field definitions, e.g.:
    # {
    #   "erp_systems": "Which ERP systems are mentioned? (SAP, Oracle, Exact, AFAS, etc.)",
    #   "p2p_tools": "Which P2P/AP automation tools? (Basware, Coupa, Tradeshift, etc.)",
    #   "team_size": "Any indication of team size?",
    #   ...
    # }
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
```

**Step 2: Update models __init__.py**

Add `ExtractionPrompt` to the imports and `__all__` list in `backend/app/models/__init__.py`.

```python
from app.models.extraction_prompt import ExtractionPrompt

__all__ = [
    "Company", "ExtractionPrompt", "HarvestRun", "SearchProfile", "SearchTerm", "Vacancy"
]
```

**Step 3: Generate and run migration**

Run: `cd backend && alembic revision --autogenerate -m "add extraction_prompts table"`
Expected: Creates a migration file.

Run: `cd backend && alembic upgrade head`
Expected: Table created. Verify with:

Run: `docker compose exec postgres psql -U signal -d signal_engine -c "\dt extraction_prompts"`

**Step 4: Commit**

```bash
git add backend/app/models/ backend/migrations/
git commit -m "feat: extraction_prompts model for versioned LLM prompts per profile"
```

---

## Task 3: Enrichment Run Tracking Model + Migration

**Files:**
- Create: `backend/app/models/enrichment.py`
- Modify: `backend/app/models/__init__.py`

Enrichment runs track Pass 1 (LLM) and Pass 2 (external API) separately, so we can monitor costs, errors, and throughput for each pass independently.

**Step 1: Create the enrichment run model**

```python
# backend/app/models/enrichment.py
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EnrichmentRun(Base):
    __tablename__ = "enrichment_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    pass_type: Mapped[str] = mapped_column(String(20))  # "llm" or "external"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    items_processed: Mapped[int] = mapped_column(Integer, default=0)
    items_succeeded: Mapped[int] = mapped_column(Integer, default=0)
    items_failed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # For LLM pass: tokens used (for cost tracking)
    tokens_input: Mapped[int] = mapped_column(Integer, default=0)
    tokens_output: Mapped[int] = mapped_column(Integer, default=0)
```

**Step 2: Add enrichment status tracking to vacancy and company models**

Add to `Vacancy` model (`backend/app/models/vacancy.py`):

```python
    extraction_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, completed, failed, skipped
    extraction_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("enrichment_runs.id", ondelete="SET NULL"), nullable=True
    )
```

Add to `Company` model (`backend/app/models/company.py`):

```python
    enrichment_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, completed, failed, skipped
    enrichment_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("enrichment_runs.id", ondelete="SET NULL"), nullable=True
    )
    kvk_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    company_info_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # extraction_quality: aggregated quality score from LLM extraction across all vacancies
    extraction_quality: Mapped[float | None] = mapped_column(nullable=True)
```

**Step 3: Update models __init__.py**

Add `EnrichmentRun` to imports and `__all__`.

**Step 4: Generate and run migration**

Run: `cd backend && alembic revision --autogenerate -m "add enrichment tracking fields"`
Run: `cd backend && alembic upgrade head`

**Step 5: Commit**

```bash
git add backend/app/models/ backend/migrations/
git commit -m "feat: enrichment run tracking with vacancy extraction and company enrichment status"
```

---

## Task 4: Claude LLM Integration Client + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/integrations/__init__.py`
- Create: `backend/app/integrations/claude_llm.py`
- Create: `backend/tests/test_claude_llm.py`

This is the low-level client that wraps the Anthropic SDK. It handles structured output via tool_use, timeouts, retries, and full logging of all prompts and responses.

**Step 1: Write failing tests**

```python
# backend/tests/test_claude_llm.py
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.integrations.claude_llm import ClaudeLLMClient, ExtractionResult


MOCK_VACANCY_TEXT = """
Wij zoeken een ervaren crediteurenadministrateur voor ons team in Amsterdam.
Je werkt dagelijks met SAP en Exact Online. Het team bestaat uit 5 medewerkers
die gezamenlijk circa 15.000 inkoopfacturen per jaar verwerken.
Wij zijn een internationale organisatie met vestigingen in 3 landen.
Ervaring met Basware is een pre.
"""

MOCK_EXTRACTION_SCHEMA = {
    "erp_systems": "Which ERP systems are mentioned? (SAP, Oracle, Exact, AFAS, etc.)",
    "p2p_tools": "Which P2P/AP automation tools are mentioned? (Basware, Coupa, etc.)",
    "team_size": "Any indication of team size?",
    "volume_indicators": "Any mention of invoice volumes, transaction counts?",
    "complexity_signals": "International operations, multiple entities, languages?",
    "automation_status": "Current level of automation mentioned?",
}


def _mock_tool_use_response(extracted: dict) -> MagicMock:
    """Build a mock Anthropic response with tool_use content block."""
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.name = "extract_vacancy_data"
    tool_block.input = extracted

    usage = MagicMock()
    usage.input_tokens = 500
    usage.output_tokens = 200

    response = MagicMock()
    response.content = [tool_block]
    response.usage = usage
    response.stop_reason = "tool_use"
    return response


def test_extraction_result_dataclass():
    result = ExtractionResult(
        extracted_data={"erp_systems": ["SAP"]},
        tokens_input=100,
        tokens_output=50,
        model="claude-sonnet-4-20250514",
        success=True,
    )
    assert result.success is True
    assert result.extracted_data["erp_systems"] == ["SAP"]


@pytest.mark.asyncio
async def test_extract_vacancy_data():
    client = ClaudeLLMClient(api_key="test-key", model="claude-sonnet-4-20250514")

    mock_extracted = {
        "erp_systems": ["SAP", "Exact Online"],
        "p2p_tools": ["Basware"],
        "team_size": "5 medewerkers",
        "volume_indicators": "15.000 inkoopfacturen per jaar",
        "complexity_signals": "internationale organisatie, 3 landen",
        "automation_status": "unknown",
    }

    with patch.object(
        client._client.messages,
        "create",
        new_callable=AsyncMock,
        return_value=_mock_tool_use_response(mock_extracted),
    ):
        result = await client.extract_vacancy_data(
            vacancy_text=MOCK_VACANCY_TEXT,
            extraction_schema=MOCK_EXTRACTION_SCHEMA,
            system_prompt="You are an expert at extracting structured data from job vacancy texts.",
        )

    assert result.success is True
    assert "SAP" in result.extracted_data["erp_systems"]
    assert result.tokens_input == 500
    assert result.tokens_output == 200


@pytest.mark.asyncio
async def test_extract_handles_api_error():
    client = ClaudeLLMClient(api_key="test-key", model="claude-sonnet-4-20250514")

    with patch.object(
        client._client.messages,
        "create",
        new_callable=AsyncMock,
        side_effect=Exception("API rate limit exceeded"),
    ):
        result = await client.extract_vacancy_data(
            vacancy_text="Some vacancy text",
            extraction_schema=MOCK_EXTRACTION_SCHEMA,
            system_prompt="Extract data.",
        )

    assert result.success is False
    assert result.error is not None
    assert "rate limit" in result.error.lower()


@pytest.mark.asyncio
async def test_extract_validates_output_schema():
    client = ClaudeLLMClient(api_key="test-key", model="claude-sonnet-4-20250514")

    # Response missing expected fields
    mock_extracted = {"erp_systems": ["SAP"]}  # Missing other fields

    with patch.object(
        client._client.messages,
        "create",
        new_callable=AsyncMock,
        return_value=_mock_tool_use_response(mock_extracted),
    ):
        result = await client.extract_vacancy_data(
            vacancy_text="Some text",
            extraction_schema=MOCK_EXTRACTION_SCHEMA,
            system_prompt="Extract data.",
        )

    # Should still succeed but fill missing fields with None
    assert result.success is True
    assert result.extracted_data.get("p2p_tools") is None


def test_build_tool_definition():
    client = ClaudeLLMClient(api_key="test-key", model="claude-sonnet-4-20250514")
    tool = client._build_extraction_tool(MOCK_EXTRACTION_SCHEMA)
    assert tool["name"] == "extract_vacancy_data"
    assert "erp_systems" in tool["input_schema"]["properties"]
    assert len(tool["input_schema"]["properties"]) == 6
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_claude_llm.py -v`
Expected: FAIL -- module not found.

**Step 3: Implement Claude LLM client**

```python
# backend/app/integrations/__init__.py
```

```python
# backend/app/integrations/claude_llm.py
import logging
from dataclasses import dataclass, field

import anthropic

logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    extracted_data: dict = field(default_factory=dict)
    tokens_input: int = 0
    tokens_output: int = 0
    model: str = ""
    success: bool = False
    error: str | None = None


class ClaudeLLMClient:
    """Low-level client wrapping the Anthropic SDK for structured extraction."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    def _build_extraction_tool(self, extraction_schema: dict) -> dict:
        """Build a tool definition from an extraction schema.

        The extraction_schema maps field names to description strings.
        Each field becomes a property in the tool's input_schema.
        """
        properties: dict = {}
        for field_name, description in extraction_schema.items():
            # All extraction fields accept string, list of strings, or null
            properties[field_name] = {
                "description": description,
                "anyOf": [
                    {"type": "string"},
                    {"type": "array", "items": {"type": "string"}},
                    {"type": "null"},
                ],
            }

        return {
            "name": "extract_vacancy_data",
            "description": (
                "Extract structured data from a job vacancy text. "
                "Return null for any field where the information is not present in the text."
            ),
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": list(extraction_schema.keys()),
            },
        }

    async def extract_vacancy_data(
        self,
        vacancy_text: str,
        extraction_schema: dict,
        system_prompt: str,
    ) -> ExtractionResult:
        """Extract structured data from vacancy text using Claude tool_use.

        Args:
            vacancy_text: The raw vacancy text to extract from.
            extraction_schema: Dict mapping field names to extraction descriptions.
            system_prompt: The system prompt (NOT user-controlled).

        Returns:
            ExtractionResult with extracted data or error information.
        """
        tool = self._build_extraction_tool(extraction_schema)

        logger.info(
            "LLM extraction: model=%s fields=%d text_length=%d",
            self.model,
            len(extraction_schema),
            len(vacancy_text),
        )

        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system_prompt,
                tools=[tool],
                tool_choice={"type": "tool", "name": "extract_vacancy_data"},
                messages=[
                    {
                        "role": "user",
                        "content": (
                            f"Extract structured data from this job vacancy text:\n\n"
                            f"---\n{vacancy_text}\n---"
                        ),
                    }
                ],
                timeout=60.0,
            )
        except Exception as exc:
            logger.error("LLM extraction failed: %s", exc)
            return ExtractionResult(
                success=False,
                error=str(exc),
                model=self.model,
            )

        # Parse tool_use response
        extracted_data = {}
        for block in response.content:
            if block.type == "tool_use" and block.name == "extract_vacancy_data":
                extracted_data = block.input
                break

        # Fill missing fields with None
        for field_name in extraction_schema:
            if field_name not in extracted_data:
                extracted_data[field_name] = None

        logger.info(
            "LLM extraction completed: tokens_in=%d tokens_out=%d fields_extracted=%d",
            response.usage.input_tokens,
            response.usage.output_tokens,
            sum(1 for v in extracted_data.values() if v is not None),
        )

        return ExtractionResult(
            extracted_data=extracted_data,
            tokens_input=response.usage.input_tokens,
            tokens_output=response.usage.output_tokens,
            model=self.model,
            success=True,
        )
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_claude_llm.py -v`
Expected: All 5 tests PASS.

**Step 5: Lint**

Run: `cd backend && ruff check . && ruff format .`

**Step 6: Commit**

```bash
git add backend/app/integrations/ backend/tests/test_claude_llm.py
git commit -m "feat: Claude LLM integration client with structured tool_use extraction"
```

---

## Task 5: KvK API Integration Client + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/integrations/kvk.py`
- Create: `backend/tests/test_kvk.py`

The KvK Handelsregister API provides two key endpoints: Zoeken (search by company name) and Basisprofiel (get details by KvK number). We use Zoeken to find the KvK number when we only have a company name, and Basisprofiel to get full company details.

**Step 1: Write failing tests**

```python
# backend/tests/test_kvk.py
from unittest.mock import AsyncMock, patch

import pytest

from app.integrations.kvk import KvKClient, KvKCompanyData


MOCK_SEARCH_RESPONSE = {
    "resultaten": [
        {
            "kvkNummer": "12345678",
            "naam": "Acme B.V.",
            "adres": {
                "binnenlandsAdres": {
                    "straatnaam": "Herengracht",
                    "huisnummer": "100",
                    "postcode": "1015 AA",
                    "plaats": "Amsterdam",
                }
            },
            "type": "hoofdvestiging",
        }
    ],
    "totaal": 1,
}

MOCK_PROFILE_RESPONSE = {
    "kvkNummer": "12345678",
    "naam": "Acme B.V.",
    "formeleRegistratiedatum": "2010-01-15",
    "indNonMailing": "Nee",
    "totaalWerkzamePersonen": 150,
    "spiIds": [
        {"spiCode": "6201", "spiOmschrijving": "Ontwikkelen en uitgeven van software"}
    ],
    "vestigingen": [
        {"vestigingsnummer": "000012345678", "eersteHandelsnaam": "Acme B.V."},
        {"vestigingsnummer": "000012345679", "eersteHandelsnaam": "Acme Rotterdam"},
    ],
    "_links": {},
}


def test_kvk_company_data_dataclass():
    data = KvKCompanyData(
        kvk_number="12345678",
        name="Acme B.V.",
        sbi_codes=[{"code": "6201", "description": "Software"}],
        employee_count=150,
        entity_count=2,
    )
    assert data.kvk_number == "12345678"
    assert data.entity_count == 2


@pytest.mark.asyncio
async def test_search_by_name():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_SEARCH_RESPONSE
    ):
        results = await client.search_by_name("Acme B.V.")

    assert len(results) == 1
    assert results[0]["kvkNummer"] == "12345678"


@pytest.mark.asyncio
async def test_search_by_name_no_results():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client,
        "_get",
        new_callable=AsyncMock,
        return_value={"resultaten": [], "totaal": 0},
    ):
        results = await client.search_by_name("Nonexistent Company")

    assert results == []


@pytest.mark.asyncio
async def test_get_company_profile():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_PROFILE_RESPONSE
    ):
        data = await client.get_company_profile("12345678")

    assert data is not None
    assert data.kvk_number == "12345678"
    assert data.name == "Acme B.V."
    assert data.employee_count == 150
    assert data.entity_count == 2
    assert len(data.sbi_codes) == 1


@pytest.mark.asyncio
async def test_get_company_profile_handles_error():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client,
        "_get",
        new_callable=AsyncMock,
        side_effect=Exception("Connection timeout"),
    ):
        data = await client.get_company_profile("12345678")

    assert data is None


@pytest.mark.asyncio
async def test_find_kvk_number():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_SEARCH_RESPONSE
    ):
        kvk_number = await client.find_kvk_number("Acme B.V.")

    assert kvk_number == "12345678"
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_kvk.py -v`
Expected: FAIL.

**Step 3: Implement KvK client**

```python
# backend/app/integrations/kvk.py
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

KVK_ZOEKEN_URL = "https://api.kvk.nl/api/v2/zoeken"
KVK_BASISPROFIEL_URL = "https://api.kvk.nl/api/v1/basisprofielen"


@dataclass
class KvKCompanyData:
    kvk_number: str
    name: str
    sbi_codes: list[dict] = field(default_factory=list)
    employee_count: int | None = None
    entity_count: int | None = None
    address: dict | None = None
    registration_date: str | None = None
    raw_data: dict = field(default_factory=dict)


class KvKClient:
    """Client for the KvK Handelsregister API."""

    def __init__(self, api_key: str, base_url: str = "https://api.kvk.nl"):
        self.api_key = api_key
        self.base_url = base_url

    async def _get(self, url: str, params: dict | None = None) -> dict:
        """Make an authenticated GET request to the KvK API."""
        headers = {"apikey": self.api_key}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()

    async def search_by_name(self, company_name: str) -> list[dict]:
        """Search KvK by company name. Returns raw result list."""
        try:
            data = await self._get(
                f"{self.base_url}/api/v2/zoeken",
                params={"naam": company_name, "pagina": 1, "resultatenPerPagina": 10},
            )
            return data.get("resultaten", [])
        except Exception as exc:
            logger.error("KvK search failed for %r: %s", company_name, exc)
            return []

    async def find_kvk_number(self, company_name: str) -> str | None:
        """Search for a company by name and return the best-match KvK number."""
        results = await self.search_by_name(company_name)
        if not results:
            return None
        # Return the first result's KvK number (best match)
        return results[0].get("kvkNummer")

    async def get_company_profile(self, kvk_number: str) -> KvKCompanyData | None:
        """Get full company profile by KvK number."""
        try:
            data = await self._get(
                f"{self.base_url}/api/v1/basisprofielen/{kvk_number}"
            )
        except Exception as exc:
            logger.error("KvK profile fetch failed for %s: %s", kvk_number, exc)
            return None

        # Parse SBI codes
        sbi_codes = []
        for sbi in data.get("spiIds", []):
            sbi_codes.append({
                "code": sbi.get("spiCode", ""),
                "description": sbi.get("spiOmschrijving", ""),
            })

        # Count entities (vestigingen)
        entity_count = len(data.get("vestigingen", []))

        return KvKCompanyData(
            kvk_number=kvk_number,
            name=data.get("naam", ""),
            sbi_codes=sbi_codes,
            employee_count=data.get("totaalWerkzamePersonen"),
            entity_count=entity_count if entity_count > 0 else None,
            registration_date=data.get("formeleRegistratiedatum"),
            raw_data=data,
        )
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_kvk.py -v`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/integrations/kvk.py backend/tests/test_kvk.py
git commit -m "feat: KvK Handelsregister API client with search and profile lookup"
```

---

## Task 6: Company.info API Integration Client + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/integrations/company_info.py`
- Create: `backend/tests/test_company_info.py`

Company.info provides financial data, employee counts, and industry classification. We use the KvK number (obtained from the KvK API or company dedup) to look up enrichment data.

**Step 1: Write failing tests**

```python
# backend/tests/test_company_info.py
from unittest.mock import AsyncMock, patch

import pytest

from app.integrations.company_info import CompanyInfoClient, CompanyFinancialData


MOCK_COMPANY_INFO_RESPONSE = {
    "kvkNumber": "12345678",
    "companyName": "Acme B.V.",
    "employeeCount": 150,
    "employeeRange": "100-199",
    "revenueRange": "10M-50M",
    "sbiCodes": [
        {"code": "6201", "description": "Software development"}
    ],
    "legalForm": "B.V.",
    "foundedDate": "2010-01-15",
    "activeStatus": True,
    "financials": {
        "revenue": 25000000,
        "profit": 3000000,
        "year": 2024,
    },
}


def test_company_financial_data_dataclass():
    data = CompanyFinancialData(
        kvk_number="12345678",
        employee_count=150,
        employee_range="100-199",
        revenue_range="10M-50M",
    )
    assert data.employee_range == "100-199"


@pytest.mark.asyncio
async def test_get_company_data():
    client = CompanyInfoClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_COMPANY_INFO_RESPONSE
    ):
        data = await client.get_company_data("12345678")

    assert data is not None
    assert data.kvk_number == "12345678"
    assert data.employee_count == 150
    assert data.revenue_range == "10M-50M"


@pytest.mark.asyncio
async def test_get_company_data_not_found():
    client = CompanyInfoClient(api_key="test-key")

    with patch.object(
        client,
        "_get",
        new_callable=AsyncMock,
        side_effect=Exception("404 Not Found"),
    ):
        data = await client.get_company_data("00000000")

    assert data is None


@pytest.mark.asyncio
async def test_get_company_data_handles_partial_response():
    client = CompanyInfoClient(api_key="test-key")

    partial_response = {
        "kvkNumber": "12345678",
        "companyName": "Acme B.V.",
        # Missing employeeCount, revenueRange, etc.
    }

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=partial_response
    ):
        data = await client.get_company_data("12345678")

    assert data is not None
    assert data.kvk_number == "12345678"
    assert data.employee_count is None
    assert data.revenue_range is None
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_company_info.py -v`
Expected: FAIL.

**Step 3: Implement Company.info client**

```python
# backend/app/integrations/company_info.py
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)


@dataclass
class CompanyFinancialData:
    kvk_number: str
    employee_count: int | None = None
    employee_range: str | None = None
    revenue_range: str | None = None
    legal_form: str | None = None
    founded_date: str | None = None
    active: bool = True
    financials: dict = field(default_factory=dict)
    raw_data: dict = field(default_factory=dict)


class CompanyInfoClient:
    """Client for the Company.info API."""

    def __init__(self, api_key: str, base_url: str = "https://api.companyinfo.nl"):
        self.api_key = api_key
        self.base_url = base_url

    async def _get(self, url: str, params: dict | None = None) -> dict:
        """Make an authenticated GET request to Company.info API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()

    async def get_company_data(self, kvk_number: str) -> CompanyFinancialData | None:
        """Get company financial and business data by KvK number."""
        try:
            data = await self._get(
                f"{self.base_url}/api/v1/companies/{kvk_number}"
            )
        except Exception as exc:
            logger.error(
                "Company.info fetch failed for KvK %s: %s", kvk_number, exc
            )
            return None

        return CompanyFinancialData(
            kvk_number=kvk_number,
            employee_count=data.get("employeeCount"),
            employee_range=data.get("employeeRange"),
            revenue_range=data.get("revenueRange"),
            legal_form=data.get("legalForm"),
            founded_date=data.get("foundedDate"),
            active=data.get("activeStatus", True),
            financials=data.get("financials", {}),
            raw_data=data,
        )
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_company_info.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/integrations/company_info.py backend/tests/test_company_info.py
git commit -m "feat: Company.info API client for financial and business data enrichment"
```

---

## Task 7: Extraction Prompt YAML + Seed + CRUD API + Tests (PARALLEL BLOCK A)

**Files:**
- Modify: `backend/profiles/accounts_payable.yaml`
- Modify: `backend/app/services/seed.py`
- Create: `backend/app/schemas/enrichment.py`
- Create: `backend/app/api/enrichment.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_extraction_prompt_api.py`

This task adds extraction prompt configuration to the AP profile YAML, extends the seed service to load extraction prompts, and provides CRUD API endpoints for managing prompts per profile.

**Step 1: Extend the AP profile YAML with extraction config**

Add the following to `backend/profiles/accounts_payable.yaml`:

```yaml
  # What the LLM should extract from vacancy texts
  extraction:
    system_prompt: |
      You are an expert at extracting structured data from Dutch and English job vacancy texts.
      Focus on identifying specific tools, systems, team sizes, and operational details.
      Return null for any field where the information is not clearly stated in the text.
      Do not guess or infer -- only extract what is explicitly mentioned.
    schema:
      erp_systems: "Which ERP systems are mentioned? Return as a list. (SAP, Oracle, Exact, Exact Online, AFAS, Unit4, Microsoft Dynamics, Visma, Twinfield, etc.)"
      p2p_tools: "Which P2P/AP automation tools are mentioned? Return as a list. (Basware, Coupa, Tradeshift, Medius, Tungsten, ReadSoft, Kofax, etc.)"
      team_size: "Any indication of team size? Return as a string, e.g. '5 medewerkers' or '10-15 FTE'."
      volume_indicators: "Any mention of invoice volumes, transaction counts, or throughput? e.g. '15.000 facturen per jaar'."
      complexity_signals: "International operations, multiple entities, languages, or multi-country? Return as a string summary."
      automation_status: "Current level of automation mentioned? e.g. 'manual processing', 'partially automated', 'using OCR'."

  # Negative signals -- if found, deprioritize
  negative_signals:
    - "implementatie van Basware"
    - "migratie naar Coupa"
    - "Tradeshift implementatie"
    - "RPA developer"
```

**Step 2: Extend seed service to load extraction prompts**

Update `backend/app/services/seed.py` to also create an `ExtractionPrompt` record when seeding a profile, if the YAML includes an `extraction` section.

Add after the profile creation logic:

```python
from app.models.extraction_prompt import ExtractionPrompt

# Inside seed_profile, after creating the profile:
    if "extraction" in profile_data:
        extraction_config = profile_data["extraction"]
        prompt = ExtractionPrompt(
            profile_id=profile.id,
            version=1,
            system_prompt=extraction_config["system_prompt"],
            extraction_schema=extraction_config["schema"],
            is_active=True,
            notes="Seeded from YAML",
        )
        db.add(prompt)
        await db.commit()
```

**Step 3: Create enrichment Pydantic schemas**

```python
# backend/app/schemas/enrichment.py
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExtractionPromptCreate(BaseModel):
    system_prompt: str
    extraction_schema: dict
    notes: str | None = None


class ExtractionPromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    version: int
    system_prompt: str
    extraction_schema: dict
    is_active: bool
    created_at: datetime
    notes: str | None


class EnrichmentRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    profile_id: int
    pass_type: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    items_processed: int
    items_succeeded: int
    items_failed: int
    error_message: str | None
    tokens_input: int
    tokens_output: int


class EnrichmentTriggerRequest(BaseModel):
    profile_id: int
    pass_type: str = "llm"  # "llm" or "external" or "both"
```

**Step 4: Create enrichment API endpoints**

```python
# backend/app/api/enrichment.py
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.enrichment import EnrichmentRun
from app.models.extraction_prompt import ExtractionPrompt
from app.schemas.enrichment import (
    ExtractionPromptCreate,
    ExtractionPromptResponse,
    EnrichmentRunResponse,
)

router = APIRouter(prefix="/api/enrichment", tags=["enrichment"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/profiles/{profile_id}/prompts",
    response_model=list[ExtractionPromptResponse],
)
async def list_extraction_prompts(
    profile_id: int, db: DbSession
) -> list[ExtractionPrompt]:
    """List all extraction prompt versions for a profile."""
    result = await db.execute(
        select(ExtractionPrompt)
        .where(ExtractionPrompt.profile_id == profile_id)
        .order_by(ExtractionPrompt.version.desc())
    )
    return list(result.scalars().all())


@router.get(
    "/profiles/{profile_id}/prompts/active",
    response_model=ExtractionPromptResponse,
)
async def get_active_prompt(
    profile_id: int, db: DbSession
) -> ExtractionPrompt:
    """Get the currently active extraction prompt for a profile."""
    result = await db.execute(
        select(ExtractionPrompt)
        .where(
            ExtractionPrompt.profile_id == profile_id,
            ExtractionPrompt.is_active == True,  # noqa: E712
        )
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(404, "No active extraction prompt for this profile")
    return prompt


@router.post(
    "/profiles/{profile_id}/prompts",
    response_model=ExtractionPromptResponse,
    status_code=201,
)
async def create_extraction_prompt(
    profile_id: int,
    payload: ExtractionPromptCreate,
    db: DbSession,
) -> ExtractionPrompt:
    """Create a new extraction prompt version. Deactivates the previous active version."""
    # Find current max version
    result = await db.execute(
        select(ExtractionPrompt.version)
        .where(ExtractionPrompt.profile_id == profile_id)
        .order_by(ExtractionPrompt.version.desc())
        .limit(1)
    )
    max_version = result.scalar_one_or_none() or 0

    # Deactivate current active prompt
    result = await db.execute(
        select(ExtractionPrompt).where(
            ExtractionPrompt.profile_id == profile_id,
            ExtractionPrompt.is_active == True,  # noqa: E712
        )
    )
    current_active = result.scalar_one_or_none()
    if current_active:
        current_active.is_active = False

    # Create new version
    prompt = ExtractionPrompt(
        profile_id=profile_id,
        version=max_version + 1,
        system_prompt=payload.system_prompt,
        extraction_schema=payload.extraction_schema,
        is_active=True,
        notes=payload.notes,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return prompt


@router.get("/runs", response_model=list[EnrichmentRunResponse])
async def list_enrichment_runs(
    db: DbSession,
    profile_id: int | None = None,
    pass_type: str | None = None,
) -> list[EnrichmentRun]:
    """List enrichment runs with optional filters."""
    query = select(EnrichmentRun).order_by(EnrichmentRun.id.desc()).limit(50)
    if profile_id:
        query = query.where(EnrichmentRun.profile_id == profile_id)
    if pass_type:
        query = query.where(EnrichmentRun.pass_type == pass_type)
    result = await db.execute(query)
    return list(result.scalars().all())
```

**Step 5: Register enrichment router in main.py**

Add to `backend/app/main.py`:

```python
from app.api.enrichment import router as enrichment_router
app.include_router(enrichment_router)
```

**Step 6: Write tests**

```python
# backend/tests/test_extraction_prompt_api.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_extraction_prompt(client: AsyncClient):
    # Create a profile first
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )

    response = await client.post(
        "/api/enrichment/profiles/1/prompts",
        json={
            "system_prompt": "Extract data from vacancy texts.",
            "extraction_schema": {
                "erp_systems": "Which ERP systems are mentioned?",
                "team_size": "Team size indication?",
            },
            "notes": "Initial version",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["version"] == 1
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_new_version_deactivates_previous(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )

    # Create version 1
    await client.post(
        "/api/enrichment/profiles/1/prompts",
        json={
            "system_prompt": "V1 prompt",
            "extraction_schema": {"erp_systems": "ERP?"},
        },
    )

    # Create version 2
    response = await client.post(
        "/api/enrichment/profiles/1/prompts",
        json={
            "system_prompt": "V2 prompt -- improved",
            "extraction_schema": {"erp_systems": "ERP?", "team_size": "Team?"},
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["version"] == 2
    assert data["is_active"] is True

    # Verify version 1 is deactivated
    list_response = await client.get("/api/enrichment/profiles/1/prompts")
    prompts = list_response.json()
    assert len(prompts) == 2
    # Most recent first
    assert prompts[0]["version"] == 2
    assert prompts[0]["is_active"] is True
    assert prompts[1]["version"] == 1
    assert prompts[1]["is_active"] is False


@pytest.mark.asyncio
async def test_get_active_prompt(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )
    await client.post(
        "/api/enrichment/profiles/1/prompts",
        json={
            "system_prompt": "Active prompt",
            "extraction_schema": {"erp_systems": "ERP?"},
        },
    )

    response = await client.get("/api/enrichment/profiles/1/prompts/active")
    assert response.status_code == 200
    assert response.json()["system_prompt"] == "Active prompt"


@pytest.mark.asyncio
async def test_get_active_prompt_not_found(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )

    response = await client.get("/api/enrichment/profiles/1/prompts/active")
    assert response.status_code == 404
```

**Step 7: Run tests**

Run: `cd backend && pytest tests/test_extraction_prompt_api.py -v`
Expected: All 4 tests PASS.

**Step 8: Commit**

```bash
git add backend/profiles/ backend/app/services/seed.py backend/app/schemas/enrichment.py backend/app/api/enrichment.py backend/app/main.py backend/tests/test_extraction_prompt_api.py
git commit -m "feat: extraction prompt CRUD API with versioning and AP profile YAML extension"
```

---

## Task 8: LLM Extraction Service (Pass 1) + Tests (PARALLEL BLOCK B)

**Files:**
- Create: `backend/app/services/extraction.py`
- Create: `backend/tests/test_extraction_service.py`

This is the core Pass 1 service. It takes vacancies with `raw_text` that have not been extracted yet, loads the active extraction prompt for their profile, calls the Claude LLM client, validates and stores the results, and computes an extraction quality score.

**Step 1: Write failing tests**

```python
# backend/tests/test_extraction_service.py
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
    profile = SearchProfile(name="AP", slug="ap", search_terms=[
        SearchTerm(term="accounts payable", language="en", priority="primary"),
    ])
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

    with patch.object(
        service, "_llm_client", create=True
    ) as mock_client:
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
        profile_id=profile.id, version=1,
        system_prompt="Extract.", extraction_schema={"erp": "ERP?"}, is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    company = Company(name="Acme", normalized_name="acme")
    db_session.add(company)
    await db_session.flush()

    # Already extracted vacancy
    vacancy = Vacancy(
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme", job_title="AP",
        raw_text="Some text", extraction_status="completed",
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
        profile_id=profile.id, version=1,
        system_prompt="Extract.", extraction_schema={"erp": "ERP?"}, is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    company = Company(name="Acme", normalized_name="acme")
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme", job_title="AP",
        raw_text="Some text", extraction_status="pending",
    )
    db_session.add(vacancy)
    await db_session.flush()

    mock_result = ExtractionResult(
        success=False, error="API timeout", model="claude-sonnet-4-20250514",
    )

    service = ExtractionService(db=db_session)
    with patch.object(service, "_llm_client", create=True) as mock_client:
        mock_client.extract_vacancy_data = AsyncMock(return_value=mock_result)
        run = await service.run_llm_extraction(profile_id=profile.id)

    assert run.items_processed == 1
    assert run.items_failed == 1

    await db_session.refresh(vacancy)
    assert vacancy.extraction_status == "failed"
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_extraction_service.py -v`
Expected: FAIL.

**Step 3: Implement extraction service**

```python
# backend/app/services/extraction.py
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.claude_llm import ClaudeLLMClient
from app.models.enrichment import EnrichmentRun
from app.models.extraction_prompt import ExtractionPrompt
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)


def compute_extraction_quality(extracted_data: dict, schema: dict) -> float:
    """Compute quality score (0.0-1.0) based on how many schema fields were extracted.

    A field counts as extracted if its value is not None and not an empty string/list.
    """
    if not schema:
        return 0.0

    extracted_count = 0
    for field_name in schema:
        value = extracted_data.get(field_name)
        if value is not None and value != "" and value != []:
            extracted_count += 1

    return extracted_count / len(schema)


class ExtractionService:
    """Pass 1: LLM extraction from vacancy text."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._llm_client = ClaudeLLMClient(
            api_key=settings.anthropic_api_key,
            model=settings.enrichment_llm_model,
        )

    async def run_llm_extraction(self, profile_id: int) -> EnrichmentRun:
        """Run LLM extraction on all pending vacancies for a profile."""
        # Load active extraction prompt
        result = await self.db.execute(
            select(ExtractionPrompt).where(
                ExtractionPrompt.profile_id == profile_id,
                ExtractionPrompt.is_active == True,  # noqa: E712
            )
        )
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise ValueError(
                f"No active extraction prompt for profile {profile_id}"
            )

        # Create enrichment run record
        run = EnrichmentRun(
            profile_id=profile_id,
            pass_type="llm",
            status="running",
            started_at=datetime.now(UTC),
        )
        self.db.add(run)
        await self.db.flush()

        # Find pending vacancies with raw_text
        result = await self.db.execute(
            select(Vacancy).where(
                Vacancy.search_profile_id == profile_id,
                Vacancy.extraction_status == "pending",
                Vacancy.raw_text.isnot(None),
                Vacancy.raw_text != "",
            )
        )
        vacancies = list(result.scalars().all())

        if not vacancies:
            logger.info("No pending vacancies for extraction in profile %d", profile_id)
            run.status = "completed"
            run.completed_at = datetime.now(UTC)
            await self.db.commit()
            return run

        logger.info(
            "Starting LLM extraction for %d vacancies in profile %d",
            len(vacancies), profile_id,
        )

        succeeded = 0
        failed = 0
        total_tokens_in = 0
        total_tokens_out = 0

        for vacancy in vacancies:
            extraction = await self._llm_client.extract_vacancy_data(
                vacancy_text=vacancy.raw_text,
                extraction_schema=prompt.extraction_schema,
                system_prompt=prompt.system_prompt,
            )

            run.items_processed += 1

            if extraction.success:
                # Validate and sanitize extracted data
                sanitized = self._sanitize_extraction(
                    extraction.extracted_data, prompt.extraction_schema
                )
                vacancy.extracted_data = sanitized
                vacancy.extraction_status = "completed"
                vacancy.extraction_run_id = run.id
                succeeded += 1
                total_tokens_in += extraction.tokens_input
                total_tokens_out += extraction.tokens_output
            else:
                vacancy.extraction_status = "failed"
                vacancy.extraction_run_id = run.id
                failed += 1
                logger.warning(
                    "LLM extraction failed for vacancy %d: %s",
                    vacancy.id, extraction.error,
                )

        run.items_succeeded = succeeded
        run.items_failed = failed
        run.tokens_input = total_tokens_in
        run.tokens_output = total_tokens_out
        run.status = "completed"
        run.completed_at = datetime.now(UTC)

        await self.db.commit()

        logger.info(
            "LLM extraction run %d completed: %d succeeded, %d failed, "
            "%d input tokens, %d output tokens",
            run.id, succeeded, failed, total_tokens_in, total_tokens_out,
        )
        return run

    def _sanitize_extraction(self, extracted: dict, schema: dict) -> dict:
        """Sanitize and validate LLM extraction output.

        - Ensures only expected fields are stored
        - Strips any unexpected nested structures
        - Fills missing fields with None
        """
        sanitized: dict = {}
        for field_name in schema:
            value = extracted.get(field_name)
            # Accept strings, lists of strings, and None
            if isinstance(value, list):
                sanitized[field_name] = [
                    str(v) for v in value if v is not None
                ]
            elif isinstance(value, str):
                sanitized[field_name] = value.strip() if value else None
            else:
                sanitized[field_name] = None
        return sanitized
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_extraction_service.py -v`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/services/extraction.py backend/tests/test_extraction_service.py
git commit -m "feat: LLM extraction service (Pass 1) with quality scoring and sanitization"
```

---

## Task 9: External Enrichment Service (Pass 2) + Tests (PARALLEL BLOCK B)

**Files:**
- Create: `backend/app/services/external_enrichment.py`
- Create: `backend/tests/test_external_enrichment.py`

Pass 2 runs only for companies that meet the minimum extraction quality threshold from Pass 1. It fetches data from KvK and Company.info and updates the company record.

**Step 1: Write failing tests**

```python
# backend/tests/test_external_enrichment.py
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

from app.integrations.company_info import CompanyFinancialData
from app.integrations.kvk import KvKCompanyData
from app.models.company import Company
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.services.external_enrichment import ExternalEnrichmentService


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


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
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme B.V.", job_title="AP",
        raw_text="Text", extraction_status="completed",
        extracted_data={"erp_systems": ["SAP"]},
    )
    db_session.add(vacancy)
    await db_session.flush()

    mock_kvk = KvKCompanyData(
        kvk_number="12345678", name="Acme B.V.",
        sbi_codes=[{"code": "6201", "description": "Software"}],
        employee_count=150, entity_count=3,
    )
    mock_company_info = CompanyFinancialData(
        kvk_number="12345678", employee_count=150,
        employee_range="100-199", revenue_range="10M-50M",
    )

    service = ExternalEnrichmentService(db=db_session)

    with (
        patch.object(service, "_kvk_client", create=True) as mock_kvk_client,
        patch.object(service, "_company_info_client", create=True) as mock_ci_client,
    ):
        mock_kvk_client.find_kvk_number = AsyncMock(return_value="12345678")
        mock_kvk_client.get_company_profile = AsyncMock(return_value=mock_kvk)
        mock_ci_client.get_company_data = AsyncMock(return_value=mock_company_info)

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
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Small Co", job_title="AP",
        raw_text="Text", extraction_status="completed",
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
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme B.V.", job_title="AP",
        raw_text="Text", extraction_status="completed",
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
        name="Acme B.V.", normalized_name="acme",
        enrichment_status="pending", extraction_quality=0.6,
    )
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme B.V.", job_title="AP",
        raw_text="Text", extraction_status="completed",
    )
    db_session.add(vacancy)
    await db_session.flush()

    service = ExternalEnrichmentService(db=db_session)
    with (
        patch.object(service, "_kvk_client", create=True) as mock_kvk_client,
        patch.object(service, "_company_info_client", create=True) as mock_ci_client,
    ):
        mock_kvk_client.find_kvk_number = AsyncMock(return_value=None)
        mock_ci_client.get_company_data = AsyncMock(return_value=None)

        run = await service.run_external_enrichment(profile_id=profile.id)

    # Partial failure -- KvK not found, but run still completes
    assert run.status == "completed"
    assert run.items_processed == 1
    # Company is enriched with whatever we got (nothing in this case)
    await db_session.refresh(company)
    assert company.enrichment_status == "completed"
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_external_enrichment.py -v`
Expected: FAIL.

**Step 3: Implement external enrichment service**

```python
# backend/app/services/external_enrichment.py
import logging
from datetime import UTC, datetime

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.company_info import CompanyInfoClient
from app.integrations.kvk import KvKClient
from app.models.company import Company
from app.models.enrichment import EnrichmentRun
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)


class ExternalEnrichmentService:
    """Pass 2: External API enrichment for qualifying companies."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._kvk_client = KvKClient(
            api_key=settings.kvk_api_key,
            base_url=settings.kvk_api_base_url,
        )
        self._company_info_client = CompanyInfoClient(
            api_key=settings.company_info_api_key,
            base_url=settings.company_info_api_base_url,
        )

    async def run_external_enrichment(self, profile_id: int) -> EnrichmentRun:
        """Enrich companies with external API data for a given profile.

        Only processes companies that:
        1. Have at least one vacancy linked to this profile
        2. Have extraction_quality >= threshold
        3. Have enrichment_status == "pending"
        """
        run = EnrichmentRun(
            profile_id=profile_id,
            pass_type="external",
            status="running",
            started_at=datetime.now(UTC),
        )
        self.db.add(run)
        await self.db.flush()

        threshold = settings.enrichment_min_quality_threshold

        # Find qualifying companies
        result = await self.db.execute(
            select(Company)
            .join(Vacancy, Vacancy.company_id == Company.id)
            .where(
                Vacancy.search_profile_id == profile_id,
                Company.enrichment_status == "pending",
                Company.extraction_quality >= threshold,
            )
            .distinct()
        )
        companies = list(result.scalars().all())

        if not companies:
            logger.info("No qualifying companies for external enrichment in profile %d", profile_id)
            run.status = "completed"
            run.completed_at = datetime.now(UTC)
            await self.db.commit()
            return run

        logger.info(
            "Starting external enrichment for %d companies in profile %d",
            len(companies), profile_id,
        )

        succeeded = 0
        failed = 0

        for company in companies:
            try:
                await self._enrich_company(company)
                company.enrichment_status = "completed"
                company.enrichment_run_id = run.id
                company.enriched_at = datetime.now(UTC)
                succeeded += 1
            except Exception as exc:
                logger.error(
                    "External enrichment failed for company %d (%s): %s",
                    company.id, company.name, exc,
                )
                company.enrichment_status = "failed"
                company.enrichment_run_id = run.id
                failed += 1

            run.items_processed += 1

        run.items_succeeded = succeeded
        run.items_failed = failed
        run.status = "completed"
        run.completed_at = datetime.now(UTC)

        await self.db.commit()

        logger.info(
            "External enrichment run %d completed: %d succeeded, %d failed",
            run.id, succeeded, failed,
        )
        return run

    async def _enrich_company(self, company: Company) -> None:
        """Enrich a single company with KvK and Company.info data."""
        # Step 1: Find KvK number if we don't have it
        if not company.kvk_number:
            kvk_number = await self._kvk_client.find_kvk_number(company.name)
            if kvk_number:
                company.kvk_number = kvk_number
                logger.info(
                    "Found KvK number %s for company %s",
                    kvk_number, company.name,
                )

        # Step 2: Get full KvK profile
        if company.kvk_number:
            kvk_data = await self._kvk_client.get_company_profile(company.kvk_number)
            if kvk_data:
                company.sbi_codes = kvk_data.sbi_codes
                company.entity_count = kvk_data.entity_count
                company.kvk_data = kvk_data.raw_data
                if kvk_data.employee_count and not company.employee_range:
                    company.employee_range = self._employee_count_to_range(
                        kvk_data.employee_count
                    )

        # Step 3: Get Company.info financial data
        if company.kvk_number:
            ci_data = await self._company_info_client.get_company_data(
                company.kvk_number
            )
            if ci_data:
                if ci_data.employee_range:
                    company.employee_range = ci_data.employee_range
                if ci_data.revenue_range:
                    company.revenue_range = ci_data.revenue_range
                company.company_info_data = ci_data.raw_data

        # Merge into enrichment_data blob for backward compatibility
        company.enrichment_data = {
            "kvk_data": company.kvk_data,
            "company_info_data": company.company_info_data,
        }

    @staticmethod
    def _employee_count_to_range(count: int) -> str:
        """Convert a numeric employee count to a range string."""
        if count < 10:
            return "1-9"
        elif count < 50:
            return "10-49"
        elif count < 100:
            return "50-99"
        elif count < 200:
            return "100-199"
        elif count < 500:
            return "200-499"
        elif count < 1000:
            return "500-999"
        else:
            return "1000+"
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_external_enrichment.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/services/external_enrichment.py backend/tests/test_external_enrichment.py
git commit -m "feat: external enrichment service (Pass 2) with KvK and Company.info integration"
```

---

## Task 10: Enrichment Orchestration Service + Tests

**Files:**
- Create: `backend/app/services/enrichment.py`
- Create: `backend/tests/test_enrichment_orchestration.py`

This service orchestrates the two-pass enrichment pipeline: run LLM extraction first, then update company-level extraction quality scores, then run external enrichment for qualifying companies.

**Step 1: Write failing tests**

```python
# backend/tests/test_enrichment_orchestration.py
from unittest.mock import AsyncMock, patch, MagicMock

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
        profile_id=profile.id, version=1,
        system_prompt="Extract.", extraction_schema={"erp": "ERP?"}, is_active=True,
    )
    db_session.add(prompt)
    await db_session.flush()

    company = Company(name="Acme", normalized_name="acme", enrichment_status="pending")
    db_session.add(company)
    await db_session.flush()

    vacancy = Vacancy(
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme", job_title="AP",
        raw_text="We use SAP.", extraction_status="pending",
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
        profile_id=profile.id, version=1,
        system_prompt="Extract.", extraction_schema={"erp": "ERP?"}, is_active=True,
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
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme", job_title="AP 1",
        raw_text="Text", extraction_status="completed",
        extracted_data={"erp": ["SAP"], "team": "5"},
    )
    v2 = Vacancy(
        external_id="v2", source="google_jobs",
        search_profile_id=profile.id, company_id=company.id,
        company_name_raw="Acme", job_title="AP 2",
        raw_text="Text", extraction_status="completed",
        extracted_data={"erp": None, "team": "3"},
    )
    db_session.add_all([v1, v2])
    await db_session.flush()

    prompt = ExtractionPrompt(
        profile_id=profile.id, version=1,
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
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_enrichment_orchestration.py -v`
Expected: FAIL.

**Step 3: Implement enrichment orchestrator**

```python
# backend/app/services/enrichment.py
import logging

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.enrichment import EnrichmentRun
from app.models.extraction_prompt import ExtractionPrompt
from app.models.vacancy import Vacancy
from app.services.extraction import ExtractionService, compute_extraction_quality
from app.services.external_enrichment import ExternalEnrichmentService

logger = logging.getLogger(__name__)


class EnrichmentOrchestrator:
    """Orchestrates the two-pass enrichment pipeline."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._extraction_service = ExtractionService(db=db)
        self._external_service = ExternalEnrichmentService(db=db)

    async def run_full_enrichment(
        self,
        profile_id: int,
        pass_type: str = "both",
    ) -> dict:
        """Run enrichment pipeline for a profile.

        Args:
            profile_id: Which profile to enrich.
            pass_type: "llm", "external", or "both".

        Returns:
            Dict with "llm_run" and/or "external_run" enrichment run records.
        """
        result: dict = {}

        if pass_type in ("llm", "both"):
            logger.info("Starting Pass 1 (LLM extraction) for profile %d", profile_id)
            llm_run = await self._extraction_service.run_llm_extraction(profile_id)
            result["llm_run"] = llm_run

            # Update company-level quality scores after LLM pass
            await self._update_company_quality_scores(profile_id)

        if pass_type in ("external", "both"):
            logger.info("Starting Pass 2 (external enrichment) for profile %d", profile_id)
            ext_run = await self._external_service.run_external_enrichment(profile_id)
            result["external_run"] = ext_run

        return result

    async def _update_company_quality_scores(self, profile_id: int) -> None:
        """Update extraction_quality on companies based on their vacancies.

        Quality is the average extraction quality across all extracted vacancies
        for that company within this profile.
        """
        # Load active extraction prompt for the schema
        result = await self.db.execute(
            select(ExtractionPrompt).where(
                ExtractionPrompt.profile_id == profile_id,
                ExtractionPrompt.is_active == True,  # noqa: E712
            )
        )
        prompt = result.scalar_one_or_none()
        if not prompt:
            return

        # Find all companies with extracted vacancies for this profile
        result = await self.db.execute(
            select(distinct(Vacancy.company_id))
            .where(
                Vacancy.search_profile_id == profile_id,
                Vacancy.extraction_status == "completed",
                Vacancy.company_id.isnot(None),
            )
        )
        company_ids = [row[0] for row in result.all()]

        for company_id in company_ids:
            result = await self.db.execute(
                select(Vacancy).where(
                    Vacancy.company_id == company_id,
                    Vacancy.search_profile_id == profile_id,
                    Vacancy.extraction_status == "completed",
                    Vacancy.extracted_data.isnot(None),
                )
            )
            vacancies = list(result.scalars().all())

            if not vacancies:
                continue

            total_quality = 0.0
            for v in vacancies:
                total_quality += compute_extraction_quality(
                    v.extracted_data, prompt.extraction_schema
                )
            avg_quality = total_quality / len(vacancies)

            result = await self.db.execute(
                select(Company).where(Company.id == company_id)
            )
            company = result.scalar_one_or_none()
            if company:
                company.extraction_quality = round(avg_quality, 4)

        await self.db.commit()
        logger.info(
            "Updated extraction quality scores for %d companies in profile %d",
            len(company_ids), profile_id,
        )
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_enrichment_orchestration.py -v`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/services/enrichment.py backend/tests/test_enrichment_orchestration.py
git commit -m "feat: enrichment orchestrator with two-pass pipeline and quality score aggregation"
```

---

## Task 11: Enrichment API Endpoints + Tests (PARALLEL BLOCK C)

**Files:**
- Modify: `backend/app/api/enrichment.py`
- Create: `backend/tests/test_enrichment_api.py`

Add trigger endpoint and vacancy extraction status endpoints.

**Step 1: Write failing tests**

```python
# backend/tests/test_enrichment_api.py
from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trigger_enrichment(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )

    with patch("app.api.enrichment.trigger_enrichment_task") as mock_task:
        mock_task.delay = lambda *a, **kw: type("obj", (), {"id": "test-task-id"})()
        response = await client.post(
            "/api/enrichment/trigger",
            json={"profile_id": 1, "pass_type": "both"},
        )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert data["pass_type"] == "both"


@pytest.mark.asyncio
async def test_list_enrichment_runs(client: AsyncClient):
    response = await client.get("/api/enrichment/runs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_list_enrichment_runs_with_filters(client: AsyncClient):
    response = await client.get(
        "/api/enrichment/runs", params={"pass_type": "llm"}
    )
    assert response.status_code == 200
```

**Step 2: Extend enrichment API with trigger endpoint**

Add to `backend/app/api/enrichment.py`:

```python
from app.schemas.enrichment import EnrichmentTriggerRequest
from app.worker import trigger_enrichment_task


@router.post("/trigger", status_code=202)
async def trigger_enrichment(payload: EnrichmentTriggerRequest) -> dict:
    """Queue an enrichment run for a profile."""
    task = trigger_enrichment_task.delay(payload.profile_id, payload.pass_type)
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": payload.profile_id,
        "pass_type": payload.pass_type,
    }
```

**Step 3: Run tests**

Run: `cd backend && pytest tests/test_enrichment_api.py -v`
Expected: All 3 tests PASS.

**Step 4: Commit**

```bash
git add backend/app/api/enrichment.py backend/tests/test_enrichment_api.py
git commit -m "feat: enrichment trigger and monitoring API endpoints"
```

---

## Task 12: Celery Enrichment Tasks + Auto-Trigger After Harvest (PARALLEL BLOCK C)

**Files:**
- Modify: `backend/app/worker.py`

This task adds enrichment Celery tasks and wires them to automatically trigger after a harvest run completes, creating the harvest-to-enrichment pipeline.

**Step 1: Add enrichment tasks to worker.py**

Add the following to `backend/app/worker.py`:

```python
@celery_app.task(name="app.worker.trigger_enrichment")
def trigger_enrichment_task(profile_id: int, pass_type: str = "both") -> None:
    """Celery task to trigger enrichment for a profile."""
    asyncio.run(_run_enrichment(profile_id, pass_type))


async def _run_enrichment(profile_id: int, pass_type: str) -> None:
    from app.services.enrichment import EnrichmentOrchestrator

    session_factory = _get_async_session()
    async with session_factory() as db:
        orchestrator = EnrichmentOrchestrator(db=db)
        result = await orchestrator.run_full_enrichment(
            profile_id=profile_id, pass_type=pass_type
        )
        for pass_name, run in result.items():
            logger.info(
                "Enrichment %s run completed: status=%s processed=%d",
                pass_name, run.status,
                run.items_processed if hasattr(run, "items_processed") else 0,
            )
```

**Step 2: Wire auto-trigger into harvest completion**

Modify `_run_harvest` in `backend/app/worker.py` to automatically trigger enrichment after a successful harvest:

```python
async def _run_harvest(profile_id: int, source: str) -> None:
    from app.services.harvester import HarvestService

    session_factory = _get_async_session()
    async with session_factory() as db:
        service = HarvestService(db=db)
        run = await service.run_harvest(profile_id=profile_id, source=source)
        logger.info(
            "Harvest run %d completed: %d found, %d new",
            run.id, run.vacancies_found, run.vacancies_new,
        )

        # Auto-trigger enrichment if new vacancies were found
        if run.status == "completed" and run.vacancies_new > 0:
            logger.info(
                "Auto-triggering enrichment for profile %d after harvest (%d new vacancies)",
                profile_id, run.vacancies_new,
            )
            trigger_enrichment_task.delay(profile_id, "both")
```

**Step 3: Add enrichment to beat schedule**

Add a weekly full enrichment run to the beat schedule (in case auto-trigger misses some):

```python
celery_app.conf.beat_schedule["enrich-all-profiles-weekly"] = {
    "task": "app.worker.enrich_all_profiles",
    "schedule": crontab(hour=8, minute=0, day_of_week=1),  # Monday 8 AM
}

@celery_app.task(name="app.worker.enrich_all_profiles")
def enrich_all_profiles() -> None:
    """Celery task to run enrichment for all profiles."""
    asyncio.run(_run_all_enrichments())


async def _run_all_enrichments() -> None:
    from sqlalchemy import select
    from app.models.profile import SearchProfile

    session_factory = _get_async_session()
    async with session_factory() as db:
        result = await db.execute(select(SearchProfile))
        profiles = result.scalars().all()
        for profile in profiles:
            try:
                await _run_enrichment(profile.id, "both")
            except Exception as exc:
                logger.error("Enrichment failed for profile %d: %s", profile.id, exc)
```

**Step 4: Commit**

```bash
git add backend/app/worker.py
git commit -m "feat: Celery enrichment tasks with auto-trigger after harvest and weekly schedule"
```

---

## Task 13: Company Dedup Merging (KvK-Based) + Tests

**Files:**
- Modify: `backend/app/services/dedup.py`
- Create: `backend/tests/test_company_merge.py`

Phase 1 deduplicates by normalized company name. Now that we have KvK numbers from enrichment, we can merge companies that share a KvK number but have different normalized names (e.g., "Acme" from one source and "Acme Holding" from another, both with KvK 12345678).

**Step 1: Write failing tests**

```python
# backend/tests/test_company_merge.py
import pytest
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy import select, func

from app.models.company import Company
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.services.dedup import merge_companies_by_kvk


@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@pytest.mark.asyncio
async def test_merge_companies_with_same_kvk(db_session):
    profile = SearchProfile(name="AP", slug="ap", search_terms=[])
    db_session.add(profile)
    await db_session.flush()

    c1 = Company(
        name="Acme B.V.", normalized_name="acme",
        kvk_number="12345678", employee_range="100-199",
    )
    c2 = Company(
        name="Acme Holding", normalized_name="acme holding",
        kvk_number="12345678", employee_range=None,
    )
    db_session.add_all([c1, c2])
    await db_session.flush()

    v1 = Vacancy(
        external_id="v1", source="google_jobs",
        search_profile_id=profile.id, company_id=c1.id,
        company_name_raw="Acme B.V.", job_title="AP 1", raw_text="Text",
    )
    v2 = Vacancy(
        external_id="v2", source="indeed",
        search_profile_id=profile.id, company_id=c2.id,
        company_name_raw="Acme Holding", job_title="AP 2", raw_text="Text",
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
async def test_merge_keeps_richest_data(db_session):
    c1 = Company(
        name="Acme B.V.", normalized_name="acme",
        kvk_number="12345678", employee_range="100-199",
        sbi_codes=[{"code": "6201"}], entity_count=3,
    )
    c2 = Company(
        name="Acme Holding", normalized_name="acme holding",
        kvk_number="12345678", employee_range=None,
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
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_company_merge.py -v`
Expected: FAIL.

**Step 3: Implement KvK-based merge in dedup.py**

Add to `backend/app/services/dedup.py`:

```python
async def merge_companies_by_kvk(db: AsyncSession) -> int:
    """Find companies that share a KvK number and merge them.

    The company with the most vacancies (or the oldest) survives.
    Data from the other record is merged in (fill nulls from the other record).
    All vacancies from the merged record are reassigned to the survivor.
    The merged record is then deleted.

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
        "sbi_codes", "employee_range", "revenue_range",
        "entity_count", "enrichment_data", "kvk_data",
        "company_info_data",
    ]
    for field_name in fields_to_merge:
        survivor_val = getattr(survivor, field_name, None)
        duplicate_val = getattr(duplicate, field_name, None)
        if survivor_val is None and duplicate_val is not None:
            setattr(survivor, field_name, duplicate_val)
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_company_merge.py -v`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/services/dedup.py backend/tests/test_company_merge.py
git commit -m "feat: KvK-based company dedup merging with data preservation"
```

---

## Task 14: Integration Test -- Full Harvest-to-Enrichment Pipeline

**Files:**
- Create: `backend/tests/test_enrichment_integration.py`

**Step 1: Write integration test**

```python
# backend/tests/test_enrichment_integration.py
"""Integration test: full pipeline from harvest through enrichment."""
from unittest.mock import AsyncMock, MagicMock, patch

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
from app.models.vacancy import Vacancy
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
        description=(
            "AP medewerker gezocht voor druk team met Exact Online."
        ),
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
            "system_prompt": "Extract structured data from Dutch/English vacancy texts.",
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
        harvest_service, "_search_source",
        new_callable=AsyncMock, return_value=MOCK_HARVEST_RESULTS,
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
            tokens_input=400, tokens_output=150,
            model="claude-sonnet-4-20250514", success=True,
        ),
        "gj_102": ExtractionResult(
            extracted_data={
                "erp_systems": ["Exact Online"],
                "team_size": None,
                "volume_indicators": None,
                "complexity_signals": None,
            },
            tokens_input=200, tokens_output=100,
            model="claude-sonnet-4-20250514", success=True,
        ),
        "gj_103": ExtractionResult(
            extracted_data={
                "erp_systems": None,
                "team_size": None,
                "volume_indicators": None,
                "complexity_signals": None,
            },
            tokens_input=150, tokens_output=80,
            model="claude-sonnet-4-20250514", success=True,
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
        kvk_number="12345678", name="TechCorp B.V.",
        sbi_codes=[{"code": "6201", "description": "Software"}],
        employee_count=150, entity_count=4,
    )
    mock_ci = CompanyFinancialData(
        kvk_number="12345678", employee_count=150,
        employee_range="100-199", revenue_range="10M-50M",
    )

    with (
        patch.object(
            orchestrator._external_service._kvk_client,
            "find_kvk_number",
            new_callable=AsyncMock, return_value="12345678",
        ),
        patch.object(
            orchestrator._external_service._kvk_client,
            "get_company_profile",
            new_callable=AsyncMock, return_value=mock_kvk,
        ),
        patch.object(
            orchestrator._external_service._company_info_client,
            "get_company_data",
            new_callable=AsyncMock, return_value=mock_ci,
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
```

**Step 2: Run the integration test**

Run: `cd backend && pytest tests/test_enrichment_integration.py -v`
Expected: PASS.

**Step 3: Run the full test suite**

Run: `cd backend && pytest -v`
Expected: All tests pass -- Phase 1 tests still green, Phase 2 tests all green.

**Step 4: Lint**

Run: `cd backend && ruff check . && ruff format .`

**Step 5: Commit**

```bash
git add backend/tests/test_enrichment_integration.py
git commit -m "test: integration test for full harvest-to-enrichment pipeline"
```

---

## Final Verification

After all tasks complete:

1. Run full test suite: `cd backend && pytest -v --tb=short`
2. Lint: `cd backend && ruff check .`
3. Verify Docker services: `docker compose ps`
4. Verify migrations: `cd backend && alembic upgrade head`
5. Start server: `cd backend && uvicorn app.main:app --reload`
6. Check OpenAPI docs: open `http://localhost:8000/docs`
7. Verify new endpoints appear:
   - `GET /api/enrichment/profiles/{id}/prompts`
   - `GET /api/enrichment/profiles/{id}/prompts/active`
   - `POST /api/enrichment/profiles/{id}/prompts`
   - `POST /api/enrichment/trigger`
   - `GET /api/enrichment/runs`

Expected: Everything green. The Signal Engine now has a complete two-pass enrichment pipeline with:
- Versioned extraction prompts per profile (CRUD API)
- Claude LLM vacancy text extraction (Pass 1) with structured tool_use output
- KvK Handelsregister integration (company search + profile lookup)
- Company.info integration (financial data + employee counts)
- Quality-gated external enrichment (Pass 2) -- only enriches companies above threshold
- Company-level extraction quality scoring (aggregated across all vacancies)
- KvK-based company dedup merging (consolidates records when KvK number matches)
- Celery tasks with auto-trigger (enrichment runs automatically after harvest)
- Enrichment run tracking (separate LLM and external run records with token/cost tracking)
- Full integration test covering harvest through enrichment

---

### Critical Files for Implementation

- `/Users/marcus/Documents/Projects/MakeSalesLegendary/backend/app/integrations/claude_llm.py` - Core LLM client wrapping Anthropic SDK with tool_use structured extraction; everything downstream depends on this.
- `/Users/marcus/Documents/Projects/MakeSalesLegendary/backend/app/services/extraction.py` - Pass 1 service that orchestrates LLM extraction across pending vacancies, computes quality scores, and sanitizes output.
- `/Users/marcus/Documents/Projects/MakeSalesLegendary/backend/app/services/enrichment.py` - Two-pass orchestrator that sequences LLM extraction, quality scoring, and external API enrichment.
- `/Users/marcus/Documents/Projects/MakeSalesLegendary/backend/app/models/extraction_prompt.py` - New model for versioned extraction prompts per profile; enables the feedback loop in Phase 4.
- `/Users/marcus/Documents/Projects/MakeSalesLegendary/backend/app/models/company.py` - Existing model that needs new fields (extraction_quality, enrichment_status, kvk_data, company_info_data) to support both enrichment passes.