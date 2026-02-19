import pytest
from httpx import AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


# SQLite doesn't support JSONB — compile it as JSON for tests
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@pytest.mark.asyncio
async def test_create_profile(client: AsyncClient):
    response = await client.post(
        "/api/profiles",
        json={
            "name": "Accounts Payable",
            "slug": "ap",
            "description": "AP automation leads",
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
    data = response.json()
    assert data["name"] == "Accounts Payable"
    assert data["slug"] == "ap"
    assert len(data["search_terms"]) == 2


@pytest.mark.asyncio
async def test_list_profiles(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )
    await client.post(
        "/api/profiles",
        json={"name": "HR", "slug": "hr", "search_terms": []},
    )
    response = await client.get("/api/profiles")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_get_profile(client: AsyncClient):
    create = await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )
    profile_id = create.json()["id"]
    response = await client.get(f"/api/profiles/{profile_id}")
    assert response.status_code == 200
    assert response.json()["slug"] == "ap"


@pytest.mark.asyncio
async def test_get_profile_not_found(client: AsyncClient):
    response = await client.get("/api/profiles/999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient):
    create = await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )
    profile_id = create.json()["id"]
    response = await client.put(
        f"/api/profiles/{profile_id}",
        json={
            "name": "Accounts Payable",
            "description": "Updated description",
            "search_terms": [
                {
                    "term": "AP medewerker",
                    "language": "nl",
                    "priority": "secondary",
                },
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Accounts Payable"
    assert data["description"] == "Updated description"
    assert len(data["search_terms"]) == 1


@pytest.mark.asyncio
async def test_create_profile_duplicate_slug(client: AsyncClient):
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": []},
    )
    response = await client.post(
        "/api/profiles",
        json={"name": "AP 2", "slug": "ap", "search_terms": []},
    )
    assert response.status_code == 409
