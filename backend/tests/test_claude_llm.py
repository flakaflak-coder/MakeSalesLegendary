from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.integrations.claude_llm import ClaudeLLMClient, ExtractionResult


@pytest.fixture(autouse=True)
async def setup_db():
    """Override the global setup_db fixture — these tests don't need a database."""
    yield


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
            system_prompt=(
                "You are an expert at extracting structured data "
                "from job vacancy texts."
            ),
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
