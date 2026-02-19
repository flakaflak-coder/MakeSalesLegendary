import asyncio
import logging
from dataclasses import dataclass, field

import httpx

from app.utils.ranges import employee_count_to_range, revenue_to_range

logger = logging.getLogger(__name__)


@dataclass
class ApolloCompanyData:
    name: str
    domain: str | None = None
    employee_count: int | None = None
    employee_range: str | None = None
    revenue: int | None = None
    revenue_range: str | None = None
    industry: str | None = None
    keywords: list[str] = field(default_factory=list)
    founded_year: int | None = None
    linkedin_url: str | None = None
    website_url: str | None = None
    city: str | None = None
    country: str | None = None
    apollo_id: str | None = None
    raw_data: dict = field(default_factory=dict)


@dataclass
class ApolloContact:
    name: str
    title: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    phone: str | None = None


class ApolloClient:
    """Client for Apollo.io API -- company enrichment and contact search."""

    def __init__(self, api_key: str, base_url: str = "https://api.apollo.io/api/v1"):
        self.api_key = api_key
        self.base_url = base_url

    @staticmethod
    def _employee_count_to_range(count: int) -> str | None:
        return employee_count_to_range(count)

    @staticmethod
    def _revenue_to_range(revenue: int) -> str | None:
        return revenue_to_range(revenue)

    async def _post(
        self,
        endpoint: str,
        payload: dict,
        *,
        max_retries: int = 3,
        backoff_base: float = 1.0,
    ) -> dict:
        """Make an authenticated POST request with retry and exponential backoff.

        Retries on 5xx server errors, connection errors, and timeouts.
        Backoff schedule: 1s, 2s, 4s (backoff_base * 2^attempt).
        """
        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/{endpoint}"
        last_exception: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(
                        url,
                        json=payload,
                        headers=headers,
                    )
                    response.raise_for_status()
                    return response.json()
            except httpx.HTTPStatusError as exc:
                last_exception = exc
                if exc.response.status_code >= 500 and attempt < max_retries:
                    wait = backoff_base * (2**attempt)
                    logger.warning(
                        "Apollo %s returned %d, retrying in %.1fs (attempt %d/%d)",
                        endpoint,
                        exc.response.status_code,
                        wait,
                        attempt + 1,
                        max_retries,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                last_exception = exc
                if attempt < max_retries:
                    wait = backoff_base * (2**attempt)
                    logger.warning(
                        (
                            "Apollo %s connection/timeout error, retrying in %.1fs "
                            "(attempt %d/%d): %s"
                        ),
                        endpoint,
                        wait,
                        attempt + 1,
                        max_retries,
                        exc,
                    )
                    await asyncio.sleep(wait)
                    continue
                raise

        # Should not reach here, but satisfy the type checker
        raise last_exception  # type: ignore[misc]

    async def enrich_company(
        self, *, name: str | None = None, domain: str | None = None
    ) -> ApolloCompanyData | None:
        """Enrich company by name or domain.

        Apollo's enrich endpoint requires a domain. If only a name is provided,
        we first search for the organization to find its domain, then enrich.
        """
        if not name and not domain:
            return None

        payload: dict = {}
        if domain:
            payload["domain"] = domain
        if name:
            payload["organization_name"] = name

        if not payload:
            return None

        try:
            data = await self._post("organizations/enrich", payload)
        except Exception as exc:
            logger.error("Apollo enrichment failed for %s: %s", name or domain, exc)
            return None

        org = data.get("organization")
        if not org:
            logger.warning("Apollo returned no org data for %s", name or domain)
            return None

        employee_count = org.get("estimated_num_employees")
        revenue = org.get("annual_revenue")

        return ApolloCompanyData(
            name=org.get("name", name or ""),
            domain=org.get("primary_domain"),
            employee_count=employee_count,
            employee_range=(
                employee_count_to_range(employee_count) if employee_count else None
            ),
            revenue=revenue,
            revenue_range=revenue_to_range(revenue) if revenue else None,
            industry=org.get("industry"),
            keywords=org.get("keywords", []),
            founded_year=org.get("founded_year"),
            linkedin_url=org.get("linkedin_url"),
            website_url=org.get("website_url"),
            city=org.get("city"),
            country=org.get("country"),
            apollo_id=org.get("id"),
            raw_data=org,
        )

    async def _find_domain_by_name(self, name: str) -> str | None:
        """Search Apollo for an organization by name to find its domain.

        Returns None if the top result doesn't reasonably match the search name.
        Apollo often returns unrelated results (e.g. Google) for obscure names.
        """
        try:
            data = await self._post(
                "mixed_companies/search",
                {
                    "q_organization_name": name,
                    "per_page": 5,
                },
            )
        except Exception as exc:
            logger.error("Apollo org search failed for '%s': %s", name, exc)
            return None

        orgs = data.get("organizations", [])
        if not orgs:
            return None

        # Check multiple results for a name match
        search_lower = self._normalize_company_name(name)
        for org in orgs:
            org_name = org.get("name", "")
            org_domain = org.get("primary_domain")
            if not org_domain:
                continue

            org_lower = self._normalize_company_name(org_name)

            # Accept if: names overlap significantly
            if (
                search_lower in org_lower
                or org_lower in search_lower
                or self._name_similarity(search_lower, org_lower) > 0.5
            ):
                logger.info(
                    "Apollo matched '%s' -> '%s' (%s)", name, org_name, org_domain
                )
                return org_domain

        logger.warning(
            "Apollo: no matching org for '%s' (top result was '%s')",
            name,
            orgs[0].get("name", "?"),
        )
        return None

    @staticmethod
    def _normalize_company_name(name: str) -> str:
        """Normalize company name for comparison — strip common suffixes."""
        import re

        name = name.lower().strip()
        # Remove common Dutch/English company suffixes
        for suffix in [
            "b.v.",
            "bv",
            "n.v.",
            "nv",
            "b.v",
            "n.v",
            "holding",
            "group",
            "groep",
            "nederland",
            "international",
            "services",
            "solutions",
        ]:
            name = name.replace(suffix, "")
        # Remove non-alphanumeric
        name = re.sub(r"[^a-z0-9\s]", "", name).strip()
        return name

    @staticmethod
    def _name_similarity(a: str, b: str) -> float:
        """Simple word-overlap similarity between two names."""
        words_a = set(a.split())
        words_b = set(b.split())
        if not words_a or not words_b:
            return 0.0
        overlap = words_a & words_b
        return len(overlap) / min(len(words_a), len(words_b))

    async def search_contacts(
        self,
        apollo_org_id: str,
        titles: list[str] | None = None,
        limit: int = 5,
    ) -> list[ApolloContact]:
        """Search for decision makers at a company."""
        payload: dict = {
            "organization_ids": [apollo_org_id],
            "per_page": limit,
        }
        if titles:
            payload["person_titles"] = titles

        try:
            data = await self._post("mixed_people/search", payload)
        except Exception as exc:
            logger.error(
                "Apollo contact search failed for org %s: %s", apollo_org_id, exc
            )
            return []

        contacts = []
        for person in data.get("people", []):
            contacts.append(
                ApolloContact(
                    name=person.get("name", ""),
                    title=person.get("title"),
                    email=person.get("email"),
                    linkedin_url=person.get("linkedin_url"),
                    phone=(
                        person.get("phone_numbers", [{}])[0].get("sanitized_number")
                        if person.get("phone_numbers")
                        else None
                    ),
                )
            )
        return contacts
