import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)


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
        """Make an authenticated GET request to the KvK API."""
        headers = {"apikey": self.api_key}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()

    async def search_by_name(self, company_name: str) -> list[dict]:
        """Search KvK by company name. Returns raw result list."""
        try:
            data = await self._get(
                f"{self.base_url}/api/v2/zoeken",
                params={"naam": company_name, "pagina": 1, "resultatenPerPagina": 10},
            )
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
        try:
            data = await self._get(
                f"{self.base_url}/api/v1/basisprofielen/{kvk_number}"
            )
        except Exception as exc:
            logger.error("KvK profile fetch failed for %s: %s", kvk_number, exc)
            return None

        # Parse SBI codes
        sbi_codes = []
        for sbi in data.get("spiIds", []):
            sbi_codes.append(
                {
                    "code": sbi.get("spiCode", ""),
                    "description": sbi.get("spiOmschrijving", ""),
                }
            )

        # Count entities (vestigingen)
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
