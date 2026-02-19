from unittest.mock import AsyncMock, patch

import pytest

from app.integrations.kvk import KvKClient, KvKCompanyData

MOCK_SEARCH_RESPONSE = {
    "resultaten": [
        {
            "kvkNummer": "12345678",
            "naam": "Acme B.V.",
            "adres": {
                "binnenlandsAdres": {
                    "straatnaam": "Herengracht",
                    "huisnummer": "100",
                    "postcode": "1015 AA",
                    "plaats": "Amsterdam",
                }
            },
            "type": "hoofdvestiging",
        }
    ],
    "totaal": 1,
}

MOCK_PROFILE_RESPONSE = {
    "kvkNummer": "12345678",
    "naam": "Acme B.V.",
    "formeleRegistratiedatum": "2010-01-15",
    "indNonMailing": "Nee",
    "totaalWerkzamePersonen": 150,
    "spiIds": [
        {"spiCode": "6201", "spiOmschrijving": "Ontwikkelen en uitgeven van software"}
    ],
    "vestigingen": [
        {"vestigingsnummer": "000012345678", "eersteHandelsnaam": "Acme B.V."},
        {"vestigingsnummer": "000012345679", "eersteHandelsnaam": "Acme Rotterdam"},
    ],
    "_links": {},
}


def test_kvk_company_data_dataclass():
    data = KvKCompanyData(
        kvk_number="12345678",
        name="Acme B.V.",
        sbi_codes=[{"code": "6201", "description": "Software"}],
        employee_count=150,
        entity_count=2,
    )
    assert data.kvk_number == "12345678"
    assert data.entity_count == 2


@pytest.mark.asyncio
async def test_search_by_name():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_SEARCH_RESPONSE
    ):
        results = await client.search_by_name("Acme B.V.")

    assert len(results) == 1
    assert results[0]["kvkNummer"] == "12345678"


@pytest.mark.asyncio
async def test_search_by_name_no_results():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client,
        "_get",
        new_callable=AsyncMock,
        return_value={"resultaten": [], "totaal": 0},
    ):
        results = await client.search_by_name("Nonexistent Company")

    assert results == []


@pytest.mark.asyncio
async def test_get_company_profile():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_PROFILE_RESPONSE
    ):
        data = await client.get_company_profile("12345678")

    assert data is not None
    assert data.kvk_number == "12345678"
    assert data.name == "Acme B.V."
    assert data.employee_count == 150
    assert data.entity_count == 2
    assert len(data.sbi_codes) == 1


@pytest.mark.asyncio
async def test_get_company_profile_handles_error():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client,
        "_get",
        new_callable=AsyncMock,
        side_effect=Exception("Connection timeout"),
    ):
        data = await client.get_company_profile("12345678")

    assert data is None


@pytest.mark.asyncio
async def test_find_kvk_number():
    client = KvKClient(api_key="test-key")

    with patch.object(
        client, "_get", new_callable=AsyncMock, return_value=MOCK_SEARCH_RESPONSE
    ):
        kvk_number = await client.find_kvk_number("Acme B.V.")

    assert kvk_number == "12345678"
