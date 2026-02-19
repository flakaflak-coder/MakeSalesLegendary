import asyncio
import logging
from dataclasses import dataclass, field

import httpx

from app.config import settings
from app.utils.api_cache import cache_get, cache_put

logger = logging.getLogger(__name__)


async def _request_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    max_retries: int = 3,
) -> dict:
    """Make a GET request with retry on 5xx errors, connection errors, and timeouts."""
    for attempt in range(max_retries):
        try:
            response = await client.get(url, params=params, headers=headers)
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
            if attempt == max_retries - 1:
                raise
            wait_time = 2**attempt
            logger.warning(
                "KvK request failed (attempt %d/%d), retrying in %ds: %s",
                attempt + 1,
                max_retries,
                wait_time,
                exc,
            )
            await asyncio.sleep(wait_time)
    raise RuntimeError("Unreachable")


@dataclass
class KvKCompanyData:
    kvk_number: str
    name: str
    sbi_codes: list[dict] = field(default_factory=list)
    employee_count: int | None = None
    entity_count: int | None = None
    address: dict | None = None
    registration_date: str | None = None
    raw_data: dict = field(default_factory=dict)


class KvKClient:
    """Client for the KvK Handelsregister API."""

    def __init__(self, api_key: str, base_url: str = "https://api.kvk.nl"):
        self.api_key = api_key
        self.base_url = base_url

    async def _get(self, url: str, params: dict | None = None) -> dict:
        """Make an authenticated GET request to the KvK API with retry."""
        headers = {"apikey": self.api_key}
        async with httpx.AsyncClient(timeout=30) as client:
            return await _request_with_retry(
                client, url, params=params, headers=headers
            )

    async def search_by_name(self, company_name: str) -> list[dict]:
        """Search KvK by company name. Returns raw result list."""
        cache_params = {"action": "search", "name": company_name}

        if settings.api_cache_enabled:
            cached = cache_get("kvk", cache_params, settings.api_cache_max_age_days)
            if cached is not None:
                logger.info("KvK cache hit: search %r", company_name)
                return cached.get("resultaten", [])

        try:
            data = await self._get(
                f"{self.base_url}/api/v2/zoeken",
                params={"naam": company_name, "pagina": 1, "resultatenPerPagina": 10},
            )
            if settings.api_cache_enabled:
                cache_put("kvk", cache_params, data)
            return data.get("resultaten", [])
        except Exception as exc:
            logger.error("KvK search failed for %r: %s", company_name, exc)
            return []

    async def find_kvk_number(self, company_name: str) -> str | None:
        """Search for a company by name and return the best-match KvK number."""
        results = await self.search_by_name(company_name)
        if not results:
            return None
        return results[0].get("kvkNummer")

    async def get_company_profile(self, kvk_number: str) -> KvKCompanyData | None:
        """Get full company profile by KvK number."""
        cache_params = {"action": "profile", "kvk_number": kvk_number}

        if settings.api_cache_enabled:
            cached = cache_get("kvk", cache_params, settings.api_cache_max_age_days)
            if cached is not None:
                logger.info("KvK cache hit: profile %s", kvk_number)
                data = cached
                return self._parse_profile(kvk_number, data)

        try:
            data = await self._get(
                f"{self.base_url}/api/v1/basisprofielen/{kvk_number}"
            )
            if settings.api_cache_enabled:
                cache_put("kvk", cache_params, data)
        except Exception as exc:
            logger.error("KvK profile fetch failed for %s: %s", kvk_number, exc)
            return None

        return self._parse_profile(kvk_number, data)

    @staticmethod
    def _parse_profile(kvk_number: str, data: dict) -> KvKCompanyData:
        """Parse a KvK profile response into a KvKCompanyData object."""
        sbi_codes = []
        for sbi in data.get("spiIds", []):
            sbi_codes.append(
                {
                    "code": sbi.get("spiCode", ""),
                    "description": sbi.get("spiOmschrijving", ""),
                }
            )

        entity_count = len(data.get("vestigingen", []))

        return KvKCompanyData(
            kvk_number=kvk_number,
            name=data.get("naam", ""),
            sbi_codes=sbi_codes,
            employee_count=data.get("totaalWerkzamePersonen"),
            entity_count=entity_count if entity_count > 0 else None,
            registration_date=data.get("formeleRegistratiedatum"),
            raw_data=data,
        )
