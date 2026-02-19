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
        "schedule": crontab(hour=6, minute=0),
    },
}
celery_app.conf.timezone = "Europe/Amsterdam"


def _get_async_session() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(settings.database_url)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="app.worker.trigger_harvest")
def trigger_harvest_task(profile_id: int, source: str = "google_jobs") -> None:
    """Celery task to trigger a single harvest run."""
    asyncio.run(_run_harvest(profile_id, source))


@celery_app.task(name="app.worker.harvest_all_profiles")
def harvest_all_profiles() -> None:
    """Celery task to harvest all active profiles."""
    asyncio.run(_run_all_harvests())


async def _run_harvest(profile_id: int, source: str) -> None:
    from app.services.harvester import HarvestService

    session_factory = _get_async_session()
    async with session_factory() as db:
        service = HarvestService(db=db)
        run = await service.run_harvest(profile_id=profile_id, source=source)
        logger.info(
            "Harvest run %d completed: %d found, %d new",
            run.id,
            run.vacancies_found,
            run.vacancies_new,
        )


async def _run_all_harvests() -> None:
    from sqlalchemy import select

    from app.models.profile import SearchProfile

    session_factory = _get_async_session()
    async with session_factory() as db:
        result = await db.execute(select(SearchProfile))
        profiles = result.scalars().all()
        for profile in profiles:
            try:
                await _run_harvest(profile.id, "google_jobs")
            except Exception as exc:
                logger.error("Harvest failed for profile %d: %s", profile.id, exc)
