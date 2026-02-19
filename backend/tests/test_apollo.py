from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.integrations.apollo import ApolloClient, ApolloCompanyData, ApolloContact
from app.utils.ranges import employee_count_to_range, revenue_to_range


@pytest.fixture
def apollo_client() -> ApolloClient:
    return ApolloClient(api_key="test-key", base_url="https://api.apollo.io/api/v1")


MOCK_ORG_RESPONSE = {
    "organization": {
        "id": "org_abc123",
        "name": "Acme B.V.",
        "primary_domain": "acme.nl",
        "estimated_num_employees": 150,
        "annual_revenue": 25_000_000,
        "industry": "Information Technology",
        "keywords": ["software", "automation"],
        "founded_year": 2010,
        "linkedin_url": "https://linkedin.com/company/acme",
        "website_url": "https://acme.nl",
        "city": "Amsterdam",
        "country": "Netherlands",
    }
}

MOCK_PEOPLE_RESPONSE = {
    "people": [
        {
            "name": "Jan de Vries",
            "title": "CFO",
            "email": "jan@acme.nl",
            "linkedin_url": "https://linkedin.com/in/jandevries",
            "phone_numbers": [{"sanitized_number": "+31612345678"}],
        },
        {
            "name": "Petra Jansen",
            "title": "Finance Manager",
            "email": "petra@acme.nl",
            "linkedin_url": "https://linkedin.com/in/petrajansen",
            "phone_numbers": [],
        },
    ]
}


@pytest.mark.asyncio
async def test_enrich_company_success(apollo_client: ApolloClient):
    """Test successful company enrichment by name."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MOCK_ORG_RESPONSE

        result = await apollo_client.enrich_company(name="Acme B.V.")

    assert result is not None
    assert isinstance(result, ApolloCompanyData)
    assert result.name == "Acme B.V."
    assert result.domain == "acme.nl"
    assert result.employee_count == 150
    assert result.employee_range == "100-199"
    assert result.revenue == 25_000_000
    assert result.revenue_range == "10M-50M"
    assert result.industry == "Information Technology"
    assert result.keywords == ["software", "automation"]
    assert result.founded_year == 2010
    assert result.linkedin_url == "https://linkedin.com/company/acme"
    assert result.website_url == "https://acme.nl"
    assert result.city == "Amsterdam"
    assert result.country == "Netherlands"
    assert result.apollo_id == "org_abc123"
    assert result.raw_data == MOCK_ORG_RESPONSE["organization"]

    mock_post.assert_called_once_with(
        "organizations/enrich", {"organization_name": "Acme B.V."}
    )


@pytest.mark.asyncio
async def test_enrich_company_by_domain(apollo_client: ApolloClient):
    """Test enrichment by domain takes priority in the payload."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MOCK_ORG_RESPONSE

        result = await apollo_client.enrich_company(name="Acme B.V.", domain="acme.nl")

    assert result is not None
    mock_post.assert_called_once_with(
        "organizations/enrich",
        {"domain": "acme.nl", "organization_name": "Acme B.V."},
    )


@pytest.mark.asyncio
async def test_enrich_company_no_org_found(apollo_client: ApolloClient):
    """Test graceful handling when Apollo returns no organization data."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = {"organization": None}

        result = await apollo_client.enrich_company(name="Unknown Corp")

    assert result is None


@pytest.mark.asyncio
async def test_enrich_company_empty_response(apollo_client: ApolloClient):
    """Test graceful handling when Apollo returns empty response."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = {}

        result = await apollo_client.enrich_company(name="Unknown Corp")

    assert result is None


@pytest.mark.asyncio
async def test_enrich_company_api_error(apollo_client: ApolloClient):
    """Test graceful handling of API errors."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.HTTPStatusError(
            "Rate limited",
            request=httpx.Request(
                "POST", "https://api.apollo.io/api/v1/organizations/enrich"
            ),
            response=httpx.Response(429),
        )

        result = await apollo_client.enrich_company(name="Acme B.V.")

    assert result is None


@pytest.mark.asyncio
async def test_enrich_company_no_name_or_domain(apollo_client: ApolloClient):
    """Test that calling without name or domain returns None immediately."""
    result = await apollo_client.enrich_company()

    assert result is None


@pytest.mark.asyncio
async def test_search_contacts_success(apollo_client: ApolloClient):
    """Test successful contact search."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = MOCK_PEOPLE_RESPONSE

        contacts = await apollo_client.search_contacts(
            apollo_org_id="org_abc123",
            titles=["CFO", "Finance Manager"],
            limit=5,
        )

    assert len(contacts) == 2
    assert all(isinstance(c, ApolloContact) for c in contacts)

    assert contacts[0].name == "Jan de Vries"
    assert contacts[0].title == "CFO"
    assert contacts[0].email == "jan@acme.nl"
    assert contacts[0].linkedin_url == "https://linkedin.com/in/jandevries"
    assert contacts[0].phone == "+31612345678"

    assert contacts[1].name == "Petra Jansen"
    assert contacts[1].title == "Finance Manager"
    assert contacts[1].phone is None  # Empty phone_numbers list

    mock_post.assert_called_once_with(
        "mixed_people/search",
        {
            "organization_ids": ["org_abc123"],
            "per_page": 5,
            "person_titles": ["CFO", "Finance Manager"],
        },
    )


@pytest.mark.asyncio
async def test_search_contacts_no_titles(apollo_client: ApolloClient):
    """Test contact search without title filter."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = {"people": []}

        contacts = await apollo_client.search_contacts(apollo_org_id="org_abc123")

    assert contacts == []
    mock_post.assert_called_once_with(
        "mixed_people/search",
        {"organization_ids": ["org_abc123"], "per_page": 5},
    )


@pytest.mark.asyncio
async def test_search_contacts_api_error(apollo_client: ApolloClient):
    """Test graceful handling of contact search errors."""
    with patch.object(apollo_client, "_post", new_callable=AsyncMock) as mock_post:
        mock_post.side_effect = httpx.HTTPStatusError(
            "Server error",
            request=httpx.Request(
                "POST", "https://api.apollo.io/api/v1/mixed_people/search"
            ),
            response=httpx.Response(500),
        )

        contacts = await apollo_client.search_contacts(apollo_org_id="org_abc123")

    assert contacts == []


class TestEmployeeCountToRange:
    """Test the _employee_count_to_range static method."""

    def test_micro(self):
        assert employee_count_to_range(5) == "1-9"

    def test_small(self):
        assert employee_count_to_range(25) == "10-49"

    def test_medium_small(self):
        assert employee_count_to_range(75) == "50-99"

    def test_medium(self):
        assert employee_count_to_range(150) == "100-199"

    def test_medium_large(self):
        assert employee_count_to_range(350) == "200-499"

    def test_large(self):
        assert employee_count_to_range(750) == "500-999"

    def test_enterprise(self):
        assert employee_count_to_range(5000) == "1000+"

    def test_boundary_10(self):
        assert employee_count_to_range(9) == "1-9"
        assert employee_count_to_range(10) == "10-49"

    def test_boundary_50(self):
        assert employee_count_to_range(49) == "10-49"
        assert employee_count_to_range(50) == "50-99"

    def test_boundary_1000(self):
        assert employee_count_to_range(999) == "500-999"
        assert employee_count_to_range(1000) == "1000+"


class TestRevenueToRange:
    """Test the _revenue_to_range static method."""

    def test_under_1m(self):
        assert revenue_to_range(500_000) == "<1M"

    def test_1m_to_10m(self):
        assert revenue_to_range(5_000_000) == "1M-10M"

    def test_10m_to_50m(self):
        assert revenue_to_range(25_000_000) == "10M-50M"

    def test_50m_to_100m(self):
        assert revenue_to_range(75_000_000) == "50M-100M"

    def test_100m_to_500m(self):
        assert revenue_to_range(250_000_000) == "100M-500M"

    def test_over_500m(self):
        assert revenue_to_range(1_000_000_000) == "500M+"

    def test_boundary_1m(self):
        assert revenue_to_range(999_999) == "<1M"
        assert revenue_to_range(1_000_000) == "1M-10M"

    def test_boundary_500m(self):
        assert revenue_to_range(499_999_999) == "100M-500M"
        assert revenue_to_range(500_000_000) == "500M+"
