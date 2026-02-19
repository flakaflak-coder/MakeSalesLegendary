# Phase 1: Harvesting MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the harvesting pipeline — find job vacancies matching configurable search profiles, deduplicate at the company level, and store them in PostgreSQL. Expose a CRUD API for profiles and a trigger/status API for harvest runs.

**Architecture:** FastAPI serves the REST API. PostgreSQL stores profiles, vacancies, companies, and harvest run logs. Celery + Redis handles scheduled and on-demand harvesting. SerpAPI (Google Jobs) is the primary scraping source; Indeed.nl is secondary. Company-level deduplication normalizes company names and aggregates vacancy signals.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), Alembic, Celery, Redis, PostgreSQL, SerpAPI, httpx + BeautifulSoup (Indeed), pytest + pytest-asyncio, ruff

---

## Dependency Graph & Parallelism

```
SEQUENTIAL FOUNDATION (Tasks 1–4)
  Task 1: Docker Compose ──→ Task 2: Python project ──→ Task 3: DB config ──→ Task 4: Models + migration

PARALLEL BLOCK A (Tasks 5–8, all independent after Task 4)
  Task 5: Profile CRUD API + tests        ─┐
  Task 6: SerpAPI harvester + tests        ─┤── all run in parallel
  Task 7: Indeed.nl scraper + tests        ─┤
  Task 8: Company dedup service + tests    ─┘

PARALLEL BLOCK B (Tasks 9–10, after Block A)
  Task 9: Harvest orchestration service    ─┐── parallel
  Task 10: AP profile YAML seed data      ─┘

SEQUENTIAL FINISH (Tasks 11–12, after Block B)
  Task 11: Celery worker + scheduled tasks
  Task 12: Integration test — full pipeline
```

---

## Task 1: Docker Compose (Postgres + Redis)

**Files:**
- Create: `docker-compose.yml`

**Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: signal
      POSTGRES_PASSWORD: signal
      POSTGRES_DB: signal_engine
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

**Step 2: Verify containers start**

Run: `docker compose up -d && docker compose ps`
Expected: Both `postgres` and `redis` show as running.

**Step 3: Verify Postgres is accessible**

Run: `docker compose exec postgres psql -U signal -d signal_engine -c "SELECT 1;"`
Expected: Returns `1`.

**Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: add Docker Compose for Postgres + Redis"
```

---

## Task 2: Python Project Setup

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/.env.example`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

**Step 1: Create pyproject.toml**

```toml
[project]
name = "signal-engine"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115,<1",
    "uvicorn[standard]>=0.34,<1",
    "sqlalchemy[asyncio]>=2.0,<3",
    "asyncpg>=0.30,<1",
    "alembic>=1.14,<2",
    "pydantic>=2.10,<3",
    "pydantic-settings>=2.7,<3",
    "celery[redis]>=5.4,<6",
    "httpx>=0.28,<1",
    "beautifulsoup4>=4.12,<5",
    "serpapi>=0.1,<1",
    "pyyaml>=6.0,<7",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3,<9",
    "pytest-asyncio>=0.25,<1",
    "pytest-httpx>=0.35,<1",
    "httpx>=0.28,<1",
    "ruff>=0.9,<1",
    "aiosqlite>=0.20,<1",
]

[tool.ruff]
target-version = "py312"
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.backends._legacy:_Backend"
```

**Step 2: Create config.py with pydantic-settings**

```python
# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://signal:signal@localhost:5432/signal_engine"
    database_url_sync: str = "postgresql://signal:signal@localhost:5432/signal_engine"
    redis_url: str = "redis://localhost:6379/0"
    serpapi_key: str = ""
    anthropic_api_key: str = ""
    kvk_api_key: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
```

**Step 3: Create FastAPI app entry point**

```python
# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(
    title="Signal Engine",
    description="Signal-based lead generation engine",
    version="0.1.0",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

**Step 4: Create .env.example**

```
DATABASE_URL=postgresql+asyncpg://signal:signal@localhost:5432/signal_engine
DATABASE_URL_SYNC=postgresql://signal:signal@localhost:5432/signal_engine
REDIS_URL=redis://localhost:6379/0
SERPAPI_KEY=
ANTHROPIC_API_KEY=
KVK_API_KEY=
```

**Step 5: Create empty __init__.py files**

Create empty `backend/app/__init__.py` and `backend/tests/__init__.py`.

**Step 6: Create test conftest.py**

```python
# backend/tests/conftest.py
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

engine = create_async_engine(TEST_DATABASE_URL)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
```

**Step 7: Install dependencies and verify**

Run: `cd backend && pip install -e ".[dev]"`
Expected: Installs without errors.

Run: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 &` then `curl http://localhost:8000/health`
Expected: `{"status":"ok"}`

Kill the server after verifying.

**Step 8: Commit**

```bash
git add backend/
git commit -m "feat: Python project setup with FastAPI, config, and test fixtures"
```

---

## Task 3: Database Configuration

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/.gitkeep`

**Step 1: Create database module**

```python
# backend/app/database.py
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
```

**Step 2: Initialize Alembic**

Run: `cd backend && alembic init migrations`

Then replace `migrations/env.py` with the async version:

```python
# backend/migrations/env.py
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url_sync,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

Update `alembic.ini` to remove the hardcoded `sqlalchemy.url` (we use settings instead):
- Set `sqlalchemy.url =` (empty — overridden in env.py)

**Step 3: Verify Alembic connects to database**

Run: `cd backend && alembic check`
Expected: No errors (no migrations pending yet).

**Step 4: Commit**

```bash
git add backend/app/database.py backend/alembic.ini backend/migrations/
git commit -m "feat: database config with async SQLAlchemy and Alembic"
```

---

## Task 4: Database Models + First Migration

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/profile.py`
- Create: `backend/app/models/vacancy.py`
- Create: `backend/app/models/company.py`
- Create: `backend/app/models/harvest.py`

**Step 1: Create the search profile model**

```python
# backend/app/models/profile.py
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SearchProfile(Base):
    __tablename__ = "search_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    search_terms: Mapped[list["SearchTerm"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class SearchTerm(Base):
    __tablename__ = "search_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        __import__("sqlalchemy").ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    term: Mapped[str] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(10), default="nl")
    priority: Mapped[str] = mapped_column(String(20), default="primary")
    category: Mapped[str] = mapped_column(String(50), default="job_title")

    profile: Mapped["SearchProfile"] = relationship(back_populates="search_terms")
```

**Step 2: Create the vacancy model**

```python
# backend/app/models/vacancy.py
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Vacancy(Base):
    __tablename__ = "vacancies"

    id: Mapped[int] = mapped_column(primary_key=True)
    external_id: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(50))  # google_jobs, indeed, etc.
    search_profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    company_name_raw: Mapped[str] = mapped_column(String(500))
    job_title: Mapped[str] = mapped_column(String(500))
    job_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(20), default="active")
    harvest_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("harvest_runs.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        Index("ix_vacancy_source_external", "source", "external_id", unique=True),
        Index("ix_vacancy_company_profile", "company_id", "search_profile_id"),
    )
```

**Step 3: Create the company model**

```python
# backend/app/models/company.py
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    kvk_number: Mapped[str | None] = mapped_column(
        String(20), unique=True, nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(500))
    normalized_name: Mapped[str] = mapped_column(String(500), index=True)
    sbi_codes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    employee_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    revenue_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_count: Mapped[int | None] = mapped_column(nullable=True)
    enrichment_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    enriched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

**Step 4: Create the harvest run model**

```python
# backend/app/models/harvest.py
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HarvestRun(Base):
    __tablename__ = "harvest_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(
        ForeignKey("search_profiles.id", ondelete="CASCADE")
    )
    source: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    vacancies_found: Mapped[int] = mapped_column(Integer, default=0)
    vacancies_new: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
```

**Step 5: Create models __init__.py that imports all models**

```python
# backend/app/models/__init__.py
from app.models.company import Company
from app.models.harvest import HarvestRun
from app.models.profile import SearchProfile, SearchTerm
from app.models.vacancy import Vacancy

__all__ = ["Company", "HarvestRun", "SearchProfile", "SearchTerm", "Vacancy"]
```

**Step 6: Update migrations/env.py to import models**

Add this import at the top of `migrations/env.py` (after the existing imports):

```python
import app.models  # noqa: F401 — registers models with Base.metadata
```

**Step 7: Generate and run migration**

Run: `cd backend && alembic revision --autogenerate -m "initial schema"`
Expected: Creates a migration file in `migrations/versions/`.

Run: `cd backend && alembic upgrade head`
Expected: Tables created in PostgreSQL. Verify with:

Run: `docker compose exec postgres psql -U signal -d signal_engine -c "\dt"`
Expected: Shows `search_profiles`, `search_terms`, `vacancies`, `companies`, `harvest_runs`, `alembic_version`.

**Step 8: Commit**

```bash
git add backend/app/models/ backend/migrations/
git commit -m "feat: database models for profiles, vacancies, companies, harvest runs"
```

---

## Task 5: Search Profile CRUD API + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/profile.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/profiles.py`
- Modify: `backend/app/main.py` — register router
- Create: `backend/tests/test_profiles.py`

**Step 1: Write failing tests for profile CRUD**

```python
# backend/tests/test_profiles.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_profile(client: AsyncClient):
    response = await client.post(
        "/api/profiles",
        json={
            "name": "Accounts Payable",
            "slug": "ap",
            "description": "AP automation leads",
            "search_terms": [
                {"term": "crediteurenadministratie", "language": "nl", "priority": "primary"},
                {"term": "accounts payable", "language": "en", "priority": "primary"},
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
    # Create two profiles
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
                {"term": "AP medewerker", "language": "nl", "priority": "secondary"},
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
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_profiles.py -v`
Expected: FAIL — no route registered.

**Step 3: Create Pydantic schemas**

```python
# backend/app/schemas/__init__.py
```

```python
# backend/app/schemas/profile.py
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SearchTermCreate(BaseModel):
    term: str
    language: str = "nl"
    priority: str = "primary"
    category: str = "job_title"


class SearchTermResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    term: str
    language: str
    priority: str
    category: str


class ProfileCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    search_terms: list[SearchTermCreate] = []


class ProfileUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    search_terms: list[SearchTermCreate] | None = None


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    description: str | None
    search_terms: list[SearchTermResponse]
    created_at: datetime
    updated_at: datetime
```

**Step 4: Create profile API routes**

```python
# backend/app/api/__init__.py
```

```python
# backend/app/api/profiles.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.profile import SearchProfile, SearchTerm
from app.schemas.profile import ProfileCreate, ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.post("", response_model=ProfileResponse, status_code=201)
async def create_profile(
    payload: ProfileCreate, db: AsyncSession = Depends(get_db)
) -> SearchProfile:
    profile = SearchProfile(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        search_terms=[
            SearchTerm(**t.model_dump()) for t in payload.search_terms
        ],
    )
    db.add(profile)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"Profile with slug '{payload.slug}' already exists")
    await db.refresh(profile, ["search_terms"])
    return profile


@router.get("", response_model=list[ProfileResponse])
async def list_profiles(db: AsyncSession = Depends(get_db)) -> list[SearchProfile]:
    result = await db.execute(
        select(SearchProfile).options(selectinload(SearchProfile.search_terms))
    )
    return list(result.scalars().all())


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(
    profile_id: int, db: AsyncSession = Depends(get_db)
) -> SearchProfile:
    result = await db.execute(
        select(SearchProfile)
        .where(SearchProfile.id == profile_id)
        .options(selectinload(SearchProfile.search_terms))
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: int,
    payload: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
) -> SearchProfile:
    result = await db.execute(
        select(SearchProfile)
        .where(SearchProfile.id == profile_id)
        .options(selectinload(SearchProfile.search_terms))
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    if payload.name is not None:
        profile.name = payload.name
    if payload.slug is not None:
        profile.slug = payload.slug
    if payload.description is not None:
        profile.description = payload.description
    if payload.search_terms is not None:
        # Replace all search terms
        profile.search_terms.clear()
        await db.flush()
        profile.search_terms = [
            SearchTerm(**t.model_dump()) for t in payload.search_terms
        ]

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"Profile with slug '{payload.slug}' already exists")
    await db.refresh(profile, ["search_terms"])
    return profile
```

**Step 5: Register router in main.py**

Update `backend/app/main.py`:

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api.profiles import router as profiles_router

app = FastAPI(
    title="Signal Engine",
    description="Signal-based lead generation engine",
    version="0.1.0",
)

app.include_router(profiles_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

**Step 6: Run tests**

Run: `cd backend && pytest tests/test_profiles.py -v`
Expected: All 6 tests PASS.

**Step 7: Lint**

Run: `cd backend && ruff check . && ruff format .`

**Step 8: Commit**

```bash
git add backend/app/schemas/ backend/app/api/ backend/app/main.py backend/tests/test_profiles.py
git commit -m "feat: search profile CRUD API with tests"
```

---

## Task 6: SerpAPI Google Jobs Harvester + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/scrapers/__init__.py`
- Create: `backend/app/scrapers/serpapi.py`
- Create: `backend/tests/test_serpapi.py`

**Step 1: Write failing tests for SerpAPI harvester**

```python
# backend/tests/test_serpapi.py
import pytest

from app.scrapers.serpapi import SerpApiHarvester, SerpApiResult


MOCK_SERPAPI_RESPONSE = {
    "jobs_results": [
        {
            "title": "Crediteurenadministrateur",
            "company_name": "Acme B.V.",
            "location": "Amsterdam, Netherlands",
            "via": "via Indeed",
            "description": "Wij zoeken een ervaren crediteurenadministrateur...",
            "job_id": "abc123",
            "detected_extensions": {"posted_at": "2 days ago"},
            "apply_options": [{"link": "https://example.com/apply"}],
        },
        {
            "title": "AP Specialist",
            "company_name": "Globex Corporation",
            "location": "Rotterdam, Netherlands",
            "via": "via LinkedIn",
            "description": "We are looking for an AP specialist to join...",
            "job_id": "def456",
            "detected_extensions": {"posted_at": "30+ days ago"},
            "apply_options": [{"link": "https://example.com/apply2"}],
        },
    ]
}


def test_parse_serpapi_response():
    harvester = SerpApiHarvester(api_key="test")
    results = harvester.parse_response(MOCK_SERPAPI_RESPONSE)
    assert len(results) == 2
    assert results[0].company_name == "Acme B.V."
    assert results[0].job_title == "Crediteurenadministrateur"
    assert results[0].location == "Amsterdam, Netherlands"
    assert results[0].source == "google_jobs"
    assert results[0].external_id == "abc123"


def test_parse_serpapi_empty_response():
    harvester = SerpApiHarvester(api_key="test")
    results = harvester.parse_response({})
    assert results == []


def test_parse_serpapi_missing_fields():
    harvester = SerpApiHarvester(api_key="test")
    results = harvester.parse_response(
        {"jobs_results": [{"title": "AP Clerk"}]}
    )
    assert len(results) == 1
    assert results[0].company_name == ""
    assert results[0].job_title == "AP Clerk"


def test_serpapi_result_dataclass():
    result = SerpApiResult(
        external_id="abc123",
        job_title="AP Clerk",
        company_name="Test Co",
        location="Amsterdam",
        description="A job description",
        job_url="https://example.com",
        source="google_jobs",
        posted_at="2 days ago",
    )
    assert result.external_id == "abc123"
    assert result.source == "google_jobs"
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_serpapi.py -v`
Expected: FAIL — module not found.

**Step 3: Implement SerpAPI harvester**

```python
# backend/app/scrapers/__init__.py
```

```python
# backend/app/scrapers/serpapi.py
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

SERPAPI_BASE_URL = "https://serpapi.com/search"


@dataclass
class SerpApiResult:
    external_id: str
    job_title: str
    company_name: str
    location: str
    description: str
    job_url: str
    source: str
    posted_at: str | None = None


class SerpApiHarvester:
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def search(self, query: str, location: str = "Netherlands") -> list[SerpApiResult]:
        """Search Google Jobs via SerpAPI for a given query string."""
        params = {
            "engine": "google_jobs",
            "q": query,
            "location": location,
            "hl": "nl",
            "api_key": self.api_key,
        }
        logger.info("SerpAPI search: query=%r location=%r", query, location)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(SERPAPI_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

        results = self.parse_response(data)
        logger.info("SerpAPI returned %d results for query=%r", len(results), query)
        return results

    def parse_response(self, data: dict) -> list[SerpApiResult]:
        """Parse the SerpAPI JSON response into structured results."""
        jobs = data.get("jobs_results", [])
        results: list[SerpApiResult] = []

        for job in jobs:
            apply_options = job.get("apply_options", [])
            job_url = apply_options[0].get("link", "") if apply_options else ""
            extensions = job.get("detected_extensions", {})

            results.append(
                SerpApiResult(
                    external_id=job.get("job_id", ""),
                    job_title=job.get("title", ""),
                    company_name=job.get("company_name", ""),
                    location=job.get("location", ""),
                    description=job.get("description", ""),
                    job_url=job_url,
                    source="google_jobs",
                    posted_at=extensions.get("posted_at"),
                )
            )
        return results
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_serpapi.py -v`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/scrapers/ backend/tests/test_serpapi.py
git commit -m "feat: SerpAPI Google Jobs harvester with response parsing"
```

---

## Task 7: Indeed.nl Scraper + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/scrapers/indeed.py`
- Create: `backend/tests/test_indeed.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_indeed.py
import pytest

from app.scrapers.indeed import IndeedScraper, IndeedResult


MOCK_INDEED_HTML = """
<html><body>
<div class="job_seen_beacon">
  <h2 class="jobTitle"><a href="/viewjob?jk=abc123" data-jk="abc123">
    <span>Crediteurenadministrateur</span>
  </a></h2>
  <span data-testid="company-name">Acme B.V.</span>
  <div data-testid="text-location">Amsterdam</div>
</div>
<div class="job_seen_beacon">
  <h2 class="jobTitle"><a href="/viewjob?jk=def456" data-jk="def456">
    <span>AP Medewerker</span>
  </a></h2>
  <span data-testid="company-name">Globex Corp</span>
  <div data-testid="text-location">Rotterdam</div>
</div>
</body></html>
"""


def test_parse_indeed_html():
    scraper = IndeedScraper()
    results = scraper.parse_html(MOCK_INDEED_HTML)
    assert len(results) == 2
    assert results[0].company_name == "Acme B.V."
    assert results[0].job_title == "Crediteurenadministrateur"
    assert results[0].source == "indeed"
    assert "abc123" in results[0].external_id


def test_parse_indeed_empty_html():
    scraper = IndeedScraper()
    results = scraper.parse_html("<html><body></body></html>")
    assert results == []


def test_indeed_result_dataclass():
    result = IndeedResult(
        external_id="abc123",
        job_title="AP Clerk",
        company_name="Test Co",
        location="Amsterdam",
        job_url="https://indeed.nl/viewjob?jk=abc123",
        source="indeed",
    )
    assert result.source == "indeed"
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_indeed.py -v`
Expected: FAIL — module not found.

**Step 3: Implement Indeed scraper**

```python
# backend/app/scrapers/indeed.py
import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

INDEED_BASE_URL = "https://nl.indeed.com/jobs"


@dataclass
class IndeedResult:
    external_id: str
    job_title: str
    company_name: str
    location: str
    job_url: str
    source: str = "indeed"


class IndeedScraper:
    async def search(self, query: str, location: str = "") -> list[IndeedResult]:
        """Scrape Indeed.nl for job listings matching the query."""
        params = {"q": query, "l": location}
        url = f"{INDEED_BASE_URL}?{urlencode(params)}"

        logger.info("Indeed scrape: query=%r location=%r", query, location)

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0"},
                follow_redirects=True,
            )
            response.raise_for_status()

        results = self.parse_html(response.text)
        logger.info("Indeed returned %d results for query=%r", len(results), query)
        return results

    def parse_html(self, html: str) -> list[IndeedResult]:
        """Parse Indeed HTML into structured results."""
        soup = BeautifulSoup(html, "html.parser")
        cards = soup.select("div.job_seen_beacon")
        results: list[IndeedResult] = []

        for card in cards:
            title_el = card.select_one("h2.jobTitle a span")
            link_el = card.select_one("h2.jobTitle a")
            company_el = card.select_one("[data-testid='company-name']")
            location_el = card.select_one("[data-testid='text-location']")

            if not title_el:
                continue

            job_key = ""
            if link_el and link_el.get("data-jk"):
                job_key = link_el["data-jk"]
            elif link_el and link_el.get("href"):
                href = link_el["href"]
                if "jk=" in href:
                    job_key = href.split("jk=")[-1].split("&")[0]

            results.append(
                IndeedResult(
                    external_id=f"indeed_{job_key}" if job_key else "",
                    job_title=title_el.get_text(strip=True),
                    company_name=company_el.get_text(strip=True) if company_el else "",
                    location=location_el.get_text(strip=True) if location_el else "",
                    job_url=f"https://nl.indeed.com/viewjob?jk={job_key}" if job_key else "",
                )
            )
        return results
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_indeed.py -v`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/scrapers/indeed.py backend/tests/test_indeed.py
git commit -m "feat: Indeed.nl scraper with HTML parsing"
```

---

## Task 8: Company Deduplication Service + Tests (PARALLEL BLOCK A)

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/dedup.py`
- Create: `backend/tests/test_dedup.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_dedup.py
import pytest

from app.services.dedup import normalize_company_name, find_or_create_company
from app.models.company import Company


def test_normalize_strips_legal_suffixes():
    assert normalize_company_name("Acme B.V.") == "acme"
    assert normalize_company_name("Globex N.V.") == "globex"
    assert normalize_company_name("Test BV") == "test"
    assert normalize_company_name("Widget NV") == "widget"


def test_normalize_strips_whitespace_and_punctuation():
    assert normalize_company_name("  Acme Corp.  ") == "acme corp"
    assert normalize_company_name("Foo & Bar") == "foo bar"
    assert normalize_company_name("ABC - XYZ") == "abc xyz"


def test_normalize_handles_common_suffixes():
    assert normalize_company_name("Tech Solutions B.V.") == "tech solutions"
    assert normalize_company_name("InnoGroup Holding B.V.") == "innogroup holding"
    assert normalize_company_name("Digital Services GmbH") == "digital services"
    assert normalize_company_name("Consulting Ltd.") == "consulting"


def test_normalize_empty_and_whitespace():
    assert normalize_company_name("") == ""
    assert normalize_company_name("   ") == ""


@pytest.mark.asyncio
async def test_find_or_create_company_creates_new(db_session):
    company = await find_or_create_company(db_session, "Acme B.V.")
    assert company.id is not None
    assert company.name == "Acme B.V."
    assert company.normalized_name == "acme"


@pytest.mark.asyncio
async def test_find_or_create_company_deduplicates(db_session):
    company1 = await find_or_create_company(db_session, "Acme B.V.")
    company2 = await find_or_create_company(db_session, "Acme BV")
    company3 = await find_or_create_company(db_session, " acme b.v. ")
    assert company1.id == company2.id == company3.id


@pytest.mark.asyncio
async def test_find_or_create_preserves_original_name(db_session):
    company = await find_or_create_company(db_session, "Acme B.V.")
    assert company.name == "Acme B.V."
    # Second call with different casing doesn't overwrite
    company2 = await find_or_create_company(db_session, "ACME bv")
    assert company2.name == "Acme B.V."
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_dedup.py -v`
Expected: FAIL — module not found.

**Step 3: Implement dedup service**

```python
# backend/app/services/__init__.py
```

```python
# backend/app/services/dedup.py
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company

# Legal suffixes to strip (Dutch + international)
_LEGAL_SUFFIXES = re.compile(
    r"\b(b\.?v\.?|n\.?v\.?|gmbh|ltd\.?|inc\.?|corp\.?|llc|s\.?a\.?|s\.?r\.?l\.?)\s*$",
    re.IGNORECASE,
)

# Characters to normalize
_NOISE_CHARS = re.compile(r"[&\-.,/\\|()\"']")


def normalize_company_name(name: str) -> str:
    """Normalize a company name for deduplication matching."""
    name = name.strip()
    if not name:
        return ""

    # Lowercase
    name = name.lower()
    # Remove legal suffixes
    name = _LEGAL_SUFFIXES.sub("", name)
    # Replace noise characters with space
    name = _NOISE_CHARS.sub(" ", name)
    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()

    return name


async def find_or_create_company(
    db: AsyncSession, raw_company_name: str
) -> Company:
    """Find an existing company by normalized name, or create a new one."""
    normalized = normalize_company_name(raw_company_name)

    result = await db.execute(
        select(Company).where(Company.normalized_name == normalized)
    )
    company = result.scalar_one_or_none()

    if company:
        return company

    company = Company(name=raw_company_name, normalized_name=normalized)
    db.add(company)
    await db.flush()
    return company
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_dedup.py -v`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/services/ backend/tests/test_dedup.py
git commit -m "feat: company deduplication with Dutch legal suffix normalization"
```

---

## Task 9: Harvest Orchestration Service (PARALLEL BLOCK B)

**Files:**
- Create: `backend/app/services/harvester.py`
- Create: `backend/tests/test_harvester.py`

**Step 1: Write failing tests**

```python
# backend/tests/test_harvester.py
from unittest.mock import AsyncMock, patch

import pytest

from app.scrapers.serpapi import SerpApiResult
from app.services.harvester import HarvestService


def _make_serpapi_results() -> list[SerpApiResult]:
    return [
        SerpApiResult(
            external_id="job1",
            job_title="AP Medewerker",
            company_name="Acme B.V.",
            location="Amsterdam",
            description="Looking for AP specialist",
            job_url="https://example.com/1",
            source="google_jobs",
        ),
        SerpApiResult(
            external_id="job2",
            job_title="Crediteurenadministrateur",
            company_name="Acme B.V.",
            location="Amsterdam",
            description="Experienced crediteurenadministrateur needed",
            job_url="https://example.com/2",
            source="google_jobs",
        ),
        SerpApiResult(
            external_id="job3",
            job_title="Accounts Payable Specialist",
            company_name="Globex Corp",
            location="Rotterdam",
            description="AP specialist for international team",
            job_url="https://example.com/3",
            source="google_jobs",
        ),
    ]


@pytest.mark.asyncio
async def test_harvest_creates_run_record(db_session):
    service = HarvestService(db=db_session)
    # Create a profile first
    from app.models.profile import SearchProfile, SearchTerm

    profile = SearchProfile(
        name="AP", slug="ap", search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ]
    )
    db_session.add(profile)
    await db_session.flush()

    with patch.object(service, "_search_source", new_callable=AsyncMock, return_value=_make_serpapi_results()):
        run = await service.run_harvest(profile_id=profile.id, source="google_jobs")

    assert run.status == "completed"
    assert run.vacancies_found == 3
    assert run.vacancies_new == 3


@pytest.mark.asyncio
async def test_harvest_deduplicates_companies(db_session):
    service = HarvestService(db=db_session)
    from app.models.profile import SearchProfile, SearchTerm

    profile = SearchProfile(
        name="AP", slug="ap", search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ]
    )
    db_session.add(profile)
    await db_session.flush()

    with patch.object(service, "_search_source", new_callable=AsyncMock, return_value=_make_serpapi_results()):
        run = await service.run_harvest(profile_id=profile.id, source="google_jobs")

    # 3 vacancies but only 2 companies (Acme appears twice)
    from sqlalchemy import select, func
    from app.models.company import Company

    count = await db_session.scalar(select(func.count(Company.id)))
    assert count == 2


@pytest.mark.asyncio
async def test_harvest_skips_duplicate_vacancies(db_session):
    service = HarvestService(db=db_session)
    from app.models.profile import SearchProfile, SearchTerm

    profile = SearchProfile(
        name="AP", slug="ap", search_terms=[
            SearchTerm(term="accounts payable", language="en", priority="primary"),
        ]
    )
    db_session.add(profile)
    await db_session.flush()

    results = _make_serpapi_results()

    with patch.object(service, "_search_source", new_callable=AsyncMock, return_value=results):
        run1 = await service.run_harvest(profile_id=profile.id, source="google_jobs")

    with patch.object(service, "_search_source", new_callable=AsyncMock, return_value=results):
        run2 = await service.run_harvest(profile_id=profile.id, source="google_jobs")

    # Second run should find 3 but add 0 new
    assert run2.vacancies_found == 3
    assert run2.vacancies_new == 0
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_harvester.py -v`
Expected: FAIL — module not found.

**Step 3: Implement harvest service**

```python
# backend/app/services/harvester.py
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.harvest import HarvestRun
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.scrapers.serpapi import SerpApiHarvester, SerpApiResult
from app.scrapers.indeed import IndeedScraper, IndeedResult
from app.services.dedup import find_or_create_company

logger = logging.getLogger(__name__)


class HarvestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_harvest(self, profile_id: int, source: str = "google_jobs") -> HarvestRun:
        """Execute a harvest run for a profile using the specified source."""
        # Load profile with search terms
        result = await self.db.execute(
            select(SearchProfile)
            .where(SearchProfile.id == profile_id)
            .options(selectinload(SearchProfile.search_terms))
        )
        profile = result.scalar_one_or_none()
        if not profile:
            raise ValueError(f"Profile {profile_id} not found")

        # Create harvest run record
        run = HarvestRun(
            profile_id=profile_id,
            source=source,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(run)
        await self.db.flush()

        try:
            # Gather results from all search terms
            all_results = await self._search_source(profile, source)

            # Store vacancies and deduplicate companies
            new_count = 0
            for item in all_results:
                was_new = await self._store_vacancy(item, profile_id, run.id)
                if was_new:
                    new_count += 1

            run.status = "completed"
            run.vacancies_found = len(all_results)
            run.vacancies_new = new_count
            run.completed_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error("Harvest run %d failed: %s", run.id, exc)
            run.status = "failed"
            run.error_message = str(exc)
            run.completed_at = datetime.now(timezone.utc)

        await self.db.commit()
        return run

    async def _search_source(
        self, profile: SearchProfile, source: str
    ) -> list[SerpApiResult | IndeedResult]:
        """Search all terms for a profile using the given source."""
        all_results: list[SerpApiResult | IndeedResult] = []

        for term in profile.search_terms:
            if source == "google_jobs":
                harvester = SerpApiHarvester(api_key=settings.serpapi_key)
                results = await harvester.search(term.term)
            elif source == "indeed":
                scraper = IndeedScraper()
                results = await scraper.search(term.term)
            else:
                raise ValueError(f"Unknown source: {source}")
            all_results.extend(results)

        return all_results

    async def _store_vacancy(
        self,
        item: SerpApiResult | IndeedResult,
        profile_id: int,
        run_id: int,
    ) -> bool:
        """Store a vacancy record, deduplicating by source + external_id.
        Returns True if the vacancy was new."""
        # Check for existing vacancy
        if item.external_id:
            result = await self.db.execute(
                select(Vacancy).where(
                    Vacancy.source == item.source,
                    Vacancy.external_id == item.external_id,
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.last_seen_at = datetime.now(timezone.utc)
                return False

        # Deduplicate company
        company = await find_or_create_company(self.db, item.company_name)

        vacancy = Vacancy(
            external_id=item.external_id,
            source=item.source,
            search_profile_id=profile_id,
            company_id=company.id,
            company_name_raw=item.company_name,
            job_title=item.job_title,
            job_url=item.job_url if hasattr(item, "job_url") else "",
            location=item.location,
            raw_text=item.description if hasattr(item, "description") else None,
            harvest_run_id=run_id,
        )
        self.db.add(vacancy)
        await self.db.flush()
        return True
```

**Step 4: Run tests**

Run: `cd backend && pytest tests/test_harvester.py -v`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add backend/app/services/harvester.py backend/tests/test_harvester.py
git commit -m "feat: harvest orchestration service with vacancy dedup and company aggregation"
```

---

## Task 10: AP Profile YAML Seed Data (PARALLEL BLOCK B)

**Files:**
- Create: `backend/profiles/accounts_payable.yaml`
- Create: `backend/app/services/seed.py`
- Create: `backend/tests/test_seed.py`

**Step 1: Create the AP profile YAML**

```yaml
# backend/profiles/accounts_payable.yaml
profile:
  name: "Accounts Payable"
  slug: "ap"
  description: "Crediteurenadministratie & factuurverwerking"

  search_terms:
    primary:
      - term: "crediteurenadministratie"
        language: "nl"
      - term: "crediteurenadministrateur"
        language: "nl"
      - term: "accounts payable"
        language: "en"
      - term: "AP medewerker"
        language: "nl"
    secondary:
      - term: "inkoopfacturen"
        language: "nl"
      - term: "factuurverwerking"
        language: "nl"
      - term: "purchase-to-pay"
        language: "en"
      - term: "P2P medewerker"
        language: "nl"
      - term: "financieel administratief medewerker"
        language: "nl"
    seniority_signals:
      - term: "teamleider crediteuren"
        language: "nl"
      - term: "manager accounts payable"
        language: "en"
      - term: "hoofd financiële administratie"
        language: "nl"
```

**Step 2: Write failing test for seed service**

```python
# backend/tests/test_seed.py
import pytest

from app.services.seed import load_profile_yaml, seed_profile
from app.models.profile import SearchProfile


def test_load_profile_yaml():
    data = load_profile_yaml("accounts_payable")
    assert data["profile"]["name"] == "Accounts Payable"
    assert data["profile"]["slug"] == "ap"
    terms = data["profile"]["search_terms"]
    assert "primary" in terms
    assert len(terms["primary"]) == 4


@pytest.mark.asyncio
async def test_seed_profile_creates_records(db_session):
    profile = await seed_profile(db_session, "accounts_payable")
    assert profile.name == "Accounts Payable"
    assert profile.slug == "ap"
    # 4 primary + 5 secondary + 3 seniority = 12 terms
    assert len(profile.search_terms) == 12


@pytest.mark.asyncio
async def test_seed_profile_is_idempotent(db_session):
    profile1 = await seed_profile(db_session, "accounts_payable")
    profile2 = await seed_profile(db_session, "accounts_payable")
    assert profile1.id == profile2.id
```

**Step 3: Run tests to verify failure**

Run: `cd backend && pytest tests/test_seed.py -v`
Expected: FAIL.

**Step 4: Implement seed service**

```python
# backend/app/services/seed.py
import logging
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.profile import SearchProfile, SearchTerm

logger = logging.getLogger(__name__)

PROFILES_DIR = Path(__file__).resolve().parent.parent.parent / "profiles"


def load_profile_yaml(profile_name: str) -> dict:
    """Load a profile YAML file by name."""
    path = PROFILES_DIR / f"{profile_name}.yaml"
    with open(path) as f:
        return yaml.safe_load(f)


async def seed_profile(db: AsyncSession, profile_name: str) -> SearchProfile:
    """Seed a search profile from YAML. Idempotent — skips if slug exists."""
    data = load_profile_yaml(profile_name)
    profile_data = data["profile"]

    # Check if already exists
    result = await db.execute(
        select(SearchProfile)
        .where(SearchProfile.slug == profile_data["slug"])
        .options(selectinload(SearchProfile.search_terms))
    )
    existing = result.scalar_one_or_none()
    if existing:
        logger.info("Profile '%s' already exists, skipping seed.", profile_data["slug"])
        return existing

    # Build search terms from all priority groups
    terms: list[SearchTerm] = []
    for priority, term_list in profile_data["search_terms"].items():
        for entry in term_list:
            terms.append(
                SearchTerm(
                    term=entry["term"],
                    language=entry.get("language", "nl"),
                    priority=priority,
                    category="job_title",
                )
            )

    profile = SearchProfile(
        name=profile_data["name"],
        slug=profile_data["slug"],
        description=profile_data.get("description"),
        search_terms=terms,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile, ["search_terms"])

    logger.info("Seeded profile '%s' with %d search terms.", profile.slug, len(terms))
    return profile
```

**Step 5: Run tests**

Run: `cd backend && pytest tests/test_seed.py -v`
Expected: All 3 tests PASS.

**Step 6: Commit**

```bash
git add backend/profiles/ backend/app/services/seed.py backend/tests/test_seed.py
git commit -m "feat: AP search profile YAML with seed service"
```

---

## Task 11: Celery Worker + Scheduled Harvesting

**Files:**
- Create: `backend/app/worker.py`
- Create: `backend/app/api/harvest.py`
- Modify: `backend/app/main.py` — register harvest router
- Create: `backend/tests/test_harvest_api.py`

**Step 1: Write failing tests for harvest API**

```python
# backend/tests/test_harvest_api.py
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_trigger_harvest(client: AsyncClient):
    # Create a profile first
    await client.post(
        "/api/profiles",
        json={"name": "AP", "slug": "ap", "search_terms": [
            {"term": "accounts payable", "language": "en", "priority": "primary"},
        ]},
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


@pytest.mark.asyncio
async def test_list_harvest_runs(client: AsyncClient):
    response = await client.get("/api/harvest/runs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

**Step 2: Run tests to verify failure**

Run: `cd backend && pytest tests/test_harvest_api.py -v`
Expected: FAIL.

**Step 3: Create Celery worker**

```python
# backend/app/worker.py
import asyncio
import logging

from celery import Celery
from celery.schedules import crontab
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery("signal_engine", broker=settings.redis_url)

celery_app.conf.beat_schedule = {
    "harvest-all-profiles-daily": {
        "task": "app.worker.harvest_all_profiles",
        "schedule": crontab(hour=6, minute=0),  # Run at 6 AM daily
    },
}
celery_app.conf.timezone = "Europe/Amsterdam"


def _get_async_session() -> AsyncSession:
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return session_factory()


@celery_app.task(name="app.worker.trigger_harvest")
def trigger_harvest_task(profile_id: int, source: str = "google_jobs"):
    """Celery task to trigger a single harvest run."""
    asyncio.run(_run_harvest(profile_id, source))


@celery_app.task(name="app.worker.harvest_all_profiles")
def harvest_all_profiles():
    """Celery task to harvest all active profiles."""
    asyncio.run(_run_all_harvests())


async def _run_harvest(profile_id: int, source: str):
    from app.services.harvester import HarvestService

    async with _get_async_session() as db:
        service = HarvestService(db=db)
        run = await service.run_harvest(profile_id=profile_id, source=source)
        logger.info(
            "Harvest run %d completed: %d found, %d new",
            run.id, run.vacancies_found, run.vacancies_new,
        )


async def _run_all_harvests():
    from sqlalchemy import select
    from app.models.profile import SearchProfile

    async with _get_async_session() as db:
        result = await db.execute(select(SearchProfile))
        profiles = result.scalars().all()
        for profile in profiles:
            try:
                await _run_harvest(profile.id, "google_jobs")
            except Exception as exc:
                logger.error("Harvest failed for profile %d: %s", profile.id, exc)
```

**Step 4: Create harvest API routes**

```python
# backend/app/api/harvest.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.harvest import HarvestRun
from app.worker import trigger_harvest_task

router = APIRouter(prefix="/api/harvest", tags=["harvest"])


class TriggerRequest(BaseModel):
    profile_id: int
    source: str = "google_jobs"


class HarvestRunResponse(BaseModel):
    id: int
    profile_id: int
    source: str
    status: str
    vacancies_found: int
    vacancies_new: int
    error_message: str | None

    class Config:
        from_attributes = True


@router.post("/trigger", status_code=202)
async def trigger_harvest(payload: TriggerRequest) -> dict:
    """Queue a harvest run for a profile."""
    task = trigger_harvest_task.delay(payload.profile_id, payload.source)
    return {
        "status": "queued",
        "task_id": task.id,
        "profile_id": payload.profile_id,
        "source": payload.source,
    }


@router.get("/runs", response_model=list[HarvestRunResponse])
async def list_harvest_runs(
    profile_id: int | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[HarvestRun]:
    """List harvest runs, optionally filtered by profile."""
    query = select(HarvestRun).order_by(HarvestRun.id.desc()).limit(50)
    if profile_id:
        query = query.where(HarvestRun.profile_id == profile_id)
    result = await db.execute(query)
    return list(result.scalars().all())
```

**Step 5: Register harvest router in main.py**

Add to `backend/app/main.py`:

```python
from app.api.harvest import router as harvest_router
app.include_router(harvest_router)
```

**Step 6: Run tests**

Run: `cd backend && pytest tests/test_harvest_api.py -v`
Expected: All 2 tests PASS.

**Step 7: Commit**

```bash
git add backend/app/worker.py backend/app/api/harvest.py backend/app/main.py backend/tests/test_harvest_api.py
git commit -m "feat: Celery worker with scheduled harvesting and harvest trigger API"
```

---

## Task 12: Integration Test — Full Pipeline

**Files:**
- Create: `backend/tests/test_integration.py`

**Step 1: Write integration test**

```python
# backend/tests/test_integration.py
"""
Integration test: full pipeline from profile creation → harvest → stored vacancies.
Uses mocked external APIs.
"""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.vacancy import Vacancy
from app.scrapers.serpapi import SerpApiResult


MOCK_RESULTS = [
    SerpApiResult(
        external_id="gj_001",
        job_title="Crediteurenadministrateur",
        company_name="Acme B.V.",
        location="Amsterdam",
        description="Wij zoeken een crediteurenadministrateur met ervaring in SAP.",
        job_url="https://example.com/1",
        source="google_jobs",
    ),
    SerpApiResult(
        external_id="gj_002",
        job_title="AP Medewerker",
        company_name="Acme BV",  # Same company, different format
        location="Amsterdam",
        description="AP medewerker voor druk team.",
        job_url="https://example.com/2",
        source="google_jobs",
    ),
    SerpApiResult(
        external_id="gj_003",
        job_title="Accounts Payable Specialist",
        company_name="Globex Corporation N.V.",
        location="Rotterdam",
        description="International AP specialist needed.",
        job_url="https://example.com/3",
        source="google_jobs",
    ),
]


@pytest.mark.asyncio
async def test_full_pipeline(client: AsyncClient, db_session: AsyncSession):
    # 1. Create a search profile via API
    response = await client.post(
        "/api/profiles",
        json={
            "name": "Accounts Payable",
            "slug": "ap",
            "description": "AP leads",
            "search_terms": [
                {"term": "crediteurenadministratie", "language": "nl", "priority": "primary"},
                {"term": "accounts payable", "language": "en", "priority": "primary"},
            ],
        },
    )
    assert response.status_code == 201
    profile_id = response.json()["id"]

    # 2. Verify profile exists
    response = await client.get(f"/api/profiles/{profile_id}")
    assert response.status_code == 200
    assert response.json()["slug"] == "ap"

    # 3. Run harvest directly (bypass Celery for integration test)
    from app.services.harvester import HarvestService

    service = HarvestService(db=db_session)
    with patch.object(service, "_search_source", new_callable=AsyncMock, return_value=MOCK_RESULTS):
        run = await service.run_harvest(profile_id=profile_id, source="google_jobs")

    assert run.status == "completed"
    assert run.vacancies_found == 3
    assert run.vacancies_new == 3

    # 4. Verify company deduplication: "Acme B.V." and "Acme BV" → same company
    company_count = await db_session.scalar(select(func.count(Company.id)))
    assert company_count == 2  # Acme + Globex

    # 5. Verify all vacancies stored
    vacancy_count = await db_session.scalar(select(func.count(Vacancy.id)))
    assert vacancy_count == 3

    # 6. Verify vacancy-company linkage
    acme_vacancies = await db_session.execute(
        select(Vacancy)
        .join(Company)
        .where(Company.normalized_name == "acme")
    )
    assert len(acme_vacancies.scalars().all()) == 2

    # 7. Run harvest again — should find 0 new (dedup)
    with patch.object(service, "_search_source", new_callable=AsyncMock, return_value=MOCK_RESULTS):
        run2 = await service.run_harvest(profile_id=profile_id, source="google_jobs")

    assert run2.vacancies_found == 3
    assert run2.vacancies_new == 0

    # 8. Verify harvest runs via API
    response = await client.get("/api/harvest/runs")
    assert response.status_code == 200
```

**Step 2: Run the integration test**

Run: `cd backend && pytest tests/test_integration.py -v`
Expected: PASS — full pipeline works end-to-end.

**Step 3: Run the full test suite**

Run: `cd backend && pytest -v`
Expected: All tests pass.

**Step 4: Lint everything**

Run: `cd backend && ruff check . && ruff format .`

**Step 5: Commit**

```bash
git add backend/tests/test_integration.py
git commit -m "test: integration test for full harvest pipeline"
```

---

## Final Verification

After all tasks complete:

1. Run full test suite: `cd backend && pytest -v --tb=short`
2. Lint: `cd backend && ruff check .`
3. Verify Docker services: `docker compose ps`
4. Verify migrations: `cd backend && alembic upgrade head`
5. Start server: `cd backend && uvicorn app.main:app --reload`
6. Hit health endpoint: `curl http://localhost:8000/health`
7. Check OpenAPI docs: open `http://localhost:8000/docs`

Expected: Everything green. The Signal Engine has a working harvest pipeline with:
- Configurable search profiles (CRUD API)
- SerpAPI + Indeed scrapers
- Company-level deduplication
- Harvest run tracking
- Celery-based scheduled harvesting
- First AP profile seeded from YAML
