import pytest
from httpx import AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


# SQLite doesn't support JSONB
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


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
