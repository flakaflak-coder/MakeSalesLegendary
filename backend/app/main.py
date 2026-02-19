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
