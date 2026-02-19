from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analytics import router as analytics_router
from app.api.enrichment import router as enrichment_router
from app.api.harvest import router as harvest_router
from app.api.leads import router as leads_router
from app.api.profiles import router as profiles_router
from app.api.scoring import router as scoring_router

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

app.include_router(profiles_router)
app.include_router(harvest_router)
app.include_router(enrichment_router)
app.include_router(leads_router)
app.include_router(analytics_router)
app.include_router(scoring_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
