import logging
from dataclasses import dataclass, field

import httpx

from app.config import settings
from app.utils.api_cache import cache_get, cache_put

logger = logging.getLogger(__name__)


@dataclass
class CompanyFinancialData:
    kvk_number: str
    employee_count: int | None = None
    employee_range: str | None = None
    revenue_range: str | None = None
    legal_form: str | None = None
    founded_date: str | None = None
    active: bool = True
    financials: dict = field(default_factory=dict)
    raw_data: dict = field(default_factory=dict)


class CompanyInfoClient:
    """Client for the Company.info API."""

    def __init__(self, api_key: str, base_url: str = "https://api.companyinfo.nl"):
        self.api_key = api_key
        self.base_url = base_url

    async def _get(self, url: str, params: dict | None = None) -> dict:
        """Make an authenticated GET request to Company.info API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()

    async def get_company_data(self, kvk_number: str) -> CompanyFinancialData | None:
        """Get company financial and business data by KvK number."""
        cache_params = {"kvk_number": kvk_number}

        if settings.api_cache_enabled:
            cached = cache_get(
                "company_info", cache_params, settings.api_cache_max_age_days
            )
            if cached is not None:
                logger.info("Company.info cache hit: %s", kvk_number)
                return self._parse_response(kvk_number, cached)

        try:
            data = await self._get(f"{self.base_url}/api/v1/companies/{kvk_number}")
            if settings.api_cache_enabled:
                cache_put("company_info", cache_params, data)
        except Exception as exc:
            logger.error("Company.info fetch failed for KvK %s: %s", kvk_number, exc)
            return None

        return self._parse_response(kvk_number, data)

    @staticmethod
    def _parse_response(kvk_number: str, data: dict) -> CompanyFinancialData:
        return CompanyFinancialData(
            kvk_number=kvk_number,
            employee_count=data.get("employeeCount"),
            employee_range=data.get("employeeRange"),
            revenue_range=data.get("revenueRange"),
            legal_form=data.get("legalForm"),
            founded_date=data.get("foundedDate"),
            active=data.get("activeStatus", True),
            financials=data.get("financials", {}),
            raw_data=data,
        )
