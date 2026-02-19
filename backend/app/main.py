from fastapi import FastAPI

from app.api.enrichment import router as enrichment_router
from app.api.harvest import router as harvest_router
from app.api.profiles import router as profiles_router

app = FastAPI(
    title="Signal Engine",
    description="Signal-based lead generation engine",
    version="0.1.0",
)

app.include_router(profiles_router)
app.include_router(harvest_router)
app.include_router(enrichment_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
