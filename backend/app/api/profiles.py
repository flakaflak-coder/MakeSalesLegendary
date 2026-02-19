from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.profile import SearchProfile, SearchTerm
from app.schemas.profile import ProfileCreate, ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.post("", response_model=ProfileResponse, status_code=201)
async def create_profile(payload: ProfileCreate, db: DbSession) -> SearchProfile:
    profile = SearchProfile(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        search_terms=[SearchTerm(**t.model_dump()) for t in payload.search_terms],
    )
    db.add(profile)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            409, f"Profile with slug '{payload.slug}' already exists"
        ) from None
    await db.refresh(profile)
    await db.refresh(profile, ["search_terms"])
    return profile


@router.get("", response_model=list[ProfileResponse])
async def list_profiles(db: DbSession) -> list[SearchProfile]:
    result = await db.execute(
        select(SearchProfile).options(selectinload(SearchProfile.search_terms))
    )
    return list(result.scalars().all())


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(profile_id: int, db: DbSession) -> SearchProfile:
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
    db: DbSession,
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
        profile.search_terms.clear()
        await db.flush()
        profile.search_terms = [
            SearchTerm(**t.model_dump()) for t in payload.search_terms
        ]

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            409, f"Profile with slug '{payload.slug}' already exists"
        ) from None
    await db.refresh(profile)
    await db.refresh(profile, ["search_terms"])
    return profile
