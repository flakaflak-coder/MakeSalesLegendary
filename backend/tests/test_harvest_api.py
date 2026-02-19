from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trigger_harvest(client: AsyncClient):
    # Create a profile first
    await client.post(
        "/api/profiles",
        json={
            "name": "AP",
            "slug": "ap",
            "search_terms": [
                {
                    "term": "accounts payable",
                    "language": "en",
                    "priority": "primary",
                },
            ],
        },
    )

    with patch("app.api.harvest.trigger_harvest_task") as mock_task:
        mock_task.delay = lambda *a, **kw: type("obj", (), {"id": "test-task-id"})()
        response = await client.post(
            "/api/harvest/trigger",
            json={"profile_id": 1, "source": "google_jobs"},
        )
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert data["task_id"] == "test-task-id"
    assert data["profile_id"] == 1
    assert data["source"] == "google_jobs"


@pytest.mark.asyncio
async def test_list_harvest_runs(client: AsyncClient):
    response = await client.get("/api/harvest/runs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_list_harvest_runs_filter_by_profile(client: AsyncClient):
    response = await client.get("/api/harvest/runs?profile_id=1")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
