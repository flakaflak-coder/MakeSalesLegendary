import logging
from dataclasses import dataclass, field

import httpx

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

    async def _post(self, endpoint: str, payload: dict) -> dict:
        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/{endpoint}",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()

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
                self._employee_count_to_range(employee_count)
                if employee_count
                else None
            ),
            revenue=revenue,
            revenue_range=self._revenue_to_range(revenue) if revenue else None,
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
            "b.v.", "bv", "n.v.", "nv", "b.v", "n.v",
            "holding", "group", "groep", "nederland",
            "international", "services", "solutions",
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

    @staticmethod
    def _employee_count_to_range(count: int) -> str:
        if count < 10:
            return "1-9"
        elif count < 50:
            return "10-49"
        elif count < 100:
            return "50-99"
        elif count < 200:
            return "100-199"
        elif count < 500:
            return "200-499"
        elif count < 1000:
            return "500-999"
        else:
            return "1000+"

    @staticmethod
    def _revenue_to_range(revenue: int) -> str:
        if revenue < 1_000_000:
            return "<1M"
        elif revenue < 10_000_000:
            return "1M-10M"
        elif revenue < 50_000_000:
            return "10M-50M"
        elif revenue < 100_000_000:
            return "50M-100M"
        elif revenue < 500_000_000:
            return "100M-500M"
        else:
            return "500M+"
