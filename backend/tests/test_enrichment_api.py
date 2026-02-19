from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


# SQLite doesn't support JSONB — compile it as JSON for tests
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@pytest.mark.asyncio
async def test_trigger_enrichment(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )

    with patch("app.worker.trigger_enrichment_task") as mock_task:
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
    response = await client.get("/api/enrichment/runs", params={"pass_type": "llm"})
    assert response.status_code == 200
