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


@app.get("/health")
async def health() -> dict[str, str]:
    status = "ok"
    db_status = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        status = "degraded"
        db_status = "error"
    return {"status": status, "db": db_status}


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
