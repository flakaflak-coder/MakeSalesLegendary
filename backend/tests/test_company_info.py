from unittest.mock import AsyncMock, patch

import pytest

from app.integrations.company_info import CompanyFinancialData, CompanyInfoClient

MOCK_COMPANY_INFO_RESPONSE = {
    "kvkNumber": "12345678",
    "companyName": "Acme B.V.",
    "employeeCount": 150,
    "employeeRange": "100-199",
    "revenueRange": "10M-50M",
    "sbiCodes": [{"code": "6201", "description": "Software development"}],
    "legalForm": "B.V.",
    "foundedDate": "2010-01-15",
    "activeStatus": True,
    "financials": {
        "revenue": 25000000,
        "profit": 3000000,
        "year": 2024,
    },
}


def test_company_financial_data_dataclass():
    data = CompanyFinancialData(
        kvk_number="12345678",
        employee_count=150,
        employee_range="100-199",
        revenue_range="10M-50M",
    )
    assert data.employee_range == "100-199"


@pytest.mark.asyncio
async def test_get_company_data():
    client = CompanyInfoClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_COMPANY_INFO_RESPONSE
    ):
        data = await client.get_company_data("12345678")

    assert data is not None
    assert data.kvk_number == "12345678"
    assert data.employee_count == 150
    assert data.revenue_range == "10M-50M"


@pytest.mark.asyncio
async def test_get_company_data_not_found():
    client = CompanyInfoClient(api_key="test-key")

    with patch.object(
        client,
        "_get",
        new_callable=AsyncMock,
        side_effect=Exception("404 Not Found"),
    ):
        data = await client.get_company_data("00000000")

    assert data is None


@pytest.mark.asyncio
async def test_get_company_data_handles_partial_response():
    client = CompanyInfoClient(api_key="test-key")

    partial_response = {
        "kvkNumber": "12345678",
        "companyName": "Acme B.V.",
        # Missing employeeCount, revenueRange, etc.
    }

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=partial_response
    ):
        data = await client.get_company_data("12345678")

    assert data is not None
    assert data.kvk_number == "12345678"
    assert data.employee_count is None
    assert data.revenue_range is None
