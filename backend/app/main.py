import asyncio

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

import app.models  # noqa: F401
from app.api.analytics import router as analytics_router
from app.api.chat import router as chat_router
from app.api.enrichment import router as enrichment_router
from app.api.events import router as events_router
from app.api.harvest import router as harvest_router
from app.api.leads import router as leads_router
from app.api.profiles import router as profiles_router
from app.api.scoring import router as scoring_router
from app.auth import require_admin
from app.config import settings
from app.database import engine

app = FastAPI(
    title="Signal Engine",
    description="Signal-based lead generation engine",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles_router, dependencies=[Depends(require_admin)])
app.include_router(harvest_router, dependencies=[Depends(require_admin)])
app.include_router(enrichment_router, dependencies=[Depends(require_admin)])
app.include_router(leads_router, dependencies=[Depends(require_admin)])
app.include_router(analytics_router, dependencies=[Depends(require_admin)])
app.include_router(scoring_router, dependencies=[Depends(require_admin)])
app.include_router(events_router, dependencies=[Depends(require_admin)])
app.include_router(chat_router, dependencies=[Depends(require_admin)])


async def _check_external_api(
    name: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
) -> tuple[str, dict[str, str | int]]:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url, headers=headers, params=params)
        if response.status_code >= 500:
            return name, {"status": "error", "code": response.status_code}
        return name, {"status": "ok", "code": response.status_code}
    except Exception:
        return name, {"status": "error"}


@app.get("/health")
async def health() -> dict[str, str]:
    status = "ok"
    db_status = "ok"
    external_status: dict[str, dict[str, str | int]] = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        status = "degraded"
        db_status = "error"

    checks = [
        _check_external_api(
            "kvk",
            settings.kvk_api_base_url,
            headers=(
                {"apikey": settings.kvk_api_key} if settings.kvk_api_key else None
            ),
        ),
        _check_external_api(
            "apollo",
            settings.apollo_api_base_url,
            headers=(
                {"x-api-key": settings.apollo_api_key}
                if settings.apollo_api_key
                else None
            ),
        ),
        _check_external_api(
            "serpapi",
            "https://serpapi.com/search",
            params=({"engine": "google_jobs"} if settings.serpapi_key else None),
        ),
    ]

    results = await asyncio.gather(*checks)
    for name, result in results:
        external_status[name] = result
        if result.get("status") == "error":
            status = "degraded"

    return {"status": status, "db": db_status, "external_apis": external_status}


@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": str(exc),
            "mode": settings.environment,
        },
    )
