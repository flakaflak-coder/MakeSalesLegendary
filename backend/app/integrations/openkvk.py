"""KVK Open Dataset API client.

Free, public API from the Dutch Chamber of Commerce (Kamer van Koophandel).
Returns basic company data: SBI codes, active status, legal form, postcode region.

Docs: https://developers.kvk.nl/nl/documentation/open-dataset-basis-bedrijfsgegevens-api
Limitations:
  - Lookup by KvK number only (no name search)
  - Only BV and NV legal forms
  - Rate limit: 100 queries per 5 minutes
  - No employee count or full address data
"""

import asyncio
import logging
from dataclasses import dataclass, field

import httpx

from app.config import settings
from app.utils.api_cache import cache_get, cache_put

logger = logging.getLogger(__name__)

BASE_URL = "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens"


@dataclass
class OpenKvKData:
    kvk_number: str
    active: bool = True
    legal_form: str | None = None
    postcode_region: str | None = None
    registration_date: str | None = None
    insolvency_code: str | None = None
    sbi_codes: list[dict] = field(default_factory=list)
    raw_data: dict = field(default_factory=dict)


class OpenKvKClient:
    """Client for the free KVK Open Dataset API."""

    async def get_company(self, kvk_number: str) -> OpenKvKData | None:
        """Look up basic company data by KvK number (free, no API key)."""
        cache_params = {"action": "openkvk_profile", "kvk_number": kvk_number}

        if settings.api_cache_enabled:
            cached = cache_get("openkvk", cache_params, settings.api_cache_max_age_days)
            if cached is not None:
                logger.info("OpenKVK cache hit: %s", kvk_number)
                return self._parse(kvk_number, cached)

        try:
            data = await self._fetch(kvk_number)
            if data is None:
                return None
            if settings.api_cache_enabled:
                cache_put("openkvk", cache_params, data)
            return self._parse(kvk_number, data)
        except Exception as exc:
            logger.error("OpenKVK lookup failed for %s: %s", kvk_number, exc)
            return None

    @staticmethod
    async def _fetch(kvk_number: str) -> dict | None:
        """Make the HTTP request with retry on transient errors."""
        url = f"{BASE_URL}/{kvk_number}"
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.get(url)
                    if response.status_code == 404:
                        logger.info("OpenKVK: KvK %s not found (404)", kvk_number)
                        return None
                    response.raise_for_status()
                    return response.json()
            except (
                httpx.HTTPStatusError,
                httpx.ConnectError,
                httpx.TimeoutException,
            ) as exc:
                if (
                    isinstance(exc, httpx.HTTPStatusError)
                    and exc.response.status_code < 500
                ):
                    raise
                if attempt == 2:
                    raise
                wait = 2**attempt
                logger.warning(
                    "OpenKVK request failed (attempt %d/3), retrying in %ds: %s",
                    attempt + 1,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)
        return None

    @staticmethod
    def _parse(kvk_number: str, data: dict) -> OpenKvKData:
        """Parse the Open Dataset response into a structured object."""
        sbi_codes = []
        for activity in data.get("activiteiten", []):
            code = activity.get("sbiCode", "")
            if code:
                sbi_codes.append(
                    {
                        "code": code,
                        "type": activity.get("soortActiviteit", ""),
                    }
                )

        return OpenKvKData(
            kvk_number=kvk_number,
            active=data.get("actief") == "J",
            legal_form=data.get("rechtsvormCode"),
            postcode_region=data.get("postcodeRegio"),
            registration_date=data.get("datumAanvang"),
            insolvency_code=data.get("insolventieCode"),
            sbi_codes=sbi_codes,
            raw_data=data,
        )
