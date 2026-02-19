from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.integrations.openkvk import OpenKvKClient, OpenKvKData

MOCK_OPENKVK_RESPONSE = {
    "kvkNummer": "12345678",
    "actief": "J",
    "rechtsvormCode": "BV",
    "postcodeRegio": "10",
    "datumAanvang": "2015-03-01",
    "insolventieCode": None,
    "activiteiten": [
        {"sbiCode": "6201", "soortActiviteit": "hoofd"},
        {"sbiCode": "6202", "soortActiviteit": "neven"},
    ],
}


def test_openkvk_data_dataclass():
    data = OpenKvKData(
        kvk_number="12345678",
        active=True,
        legal_form="BV",
        sbi_codes=[{"code": "6201", "type": "hoofd"}],
    )
    assert data.kvk_number == "12345678"
    assert data.active is True
    assert data.legal_form == "BV"
    assert data.raw_data == {}


def test_parse_active_company():
    result = OpenKvKClient._parse("12345678", MOCK_OPENKVK_RESPONSE)

    assert result.kvk_number == "12345678"
    assert result.active is True
    assert result.legal_form == "BV"
    assert result.postcode_region == "10"
    assert result.registration_date == "2015-03-01"
    assert result.insolvency_code is None
    assert len(result.sbi_codes) == 2
    assert result.sbi_codes[0] == {"code": "6201", "type": "hoofd"}
    assert result.sbi_codes[1] == {"code": "6202", "type": "neven"}
    assert result.raw_data == MOCK_OPENKVK_RESPONSE


def test_parse_inactive_company():
    data = {**MOCK_OPENKVK_RESPONSE, "actief": "N"}
    result = OpenKvKClient._parse("12345678", data)

    assert result.active is False


def test_parse_missing_actief_field():
    data = {k: v for k, v in MOCK_OPENKVK_RESPONSE.items() if k != "actief"}
    result = OpenKvKClient._parse("12345678", data)

    assert result.active is False  # None != "J" → False


def test_parse_empty_activities():
    data = {**MOCK_OPENKVK_RESPONSE, "activiteiten": []}
    result = OpenKvKClient._parse("12345678", data)

    assert result.sbi_codes == []


def test_parse_skips_activities_without_sbi_code():
    data = {
        **MOCK_OPENKVK_RESPONSE,
        "activiteiten": [
            {"sbiCode": "6201", "soortActiviteit": "hoofd"},
            {"soortActiviteit": "neven"},  # no sbiCode
            {"sbiCode": "", "soortActiviteit": "neven"},  # empty sbiCode
        ],
    }
    result = OpenKvKClient._parse("12345678", data)

    assert len(result.sbi_codes) == 1
    assert result.sbi_codes[0]["code"] == "6201"


@pytest.mark.asyncio
async def test_get_company_success():
    client = OpenKvKClient()

    with patch.object(
        client, "_fetch", new_callable=AsyncMock, return_value=MOCK_OPENKVK_RESPONSE
    ):
        result = await client.get_company("12345678")

    assert result is not None
    assert result.kvk_number == "12345678"
    assert result.active is True
    assert len(result.sbi_codes) == 2


@pytest.mark.asyncio
async def test_get_company_not_found():
    client = OpenKvKClient()

    with patch.object(
        client, "_fetch", new_callable=AsyncMock, return_value=None
    ):
        result = await client.get_company("99999999")

    assert result is None


@pytest.mark.asyncio
async def test_get_company_handles_exception():
    client = OpenKvKClient()

    with patch.object(
        client,
        "_fetch",
        new_callable=AsyncMock,
        side_effect=httpx.ConnectError("Connection refused"),
    ):
        result = await client.get_company("12345678")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_returns_json_on_success():
    url = "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/12345678"
    mock_response = httpx.Response(
        200, json=MOCK_OPENKVK_RESPONSE, request=httpx.Request("GET", url)
    )

    with patch("app.integrations.openkvk.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await OpenKvKClient._fetch("12345678")

    assert result == MOCK_OPENKVK_RESPONSE
    mock_client.get.assert_called_once_with(
        "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/12345678"
    )


@pytest.mark.asyncio
async def test_fetch_returns_none_on_404():
    mock_response = httpx.Response(404)

    with patch("app.integrations.openkvk.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await OpenKvKClient._fetch("99999999")

    assert result is None


@pytest.mark.asyncio
async def test_fetch_retries_on_server_error():
    error_response = httpx.Response(500)
    call_count = 0

    async def mock_get(url):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.HTTPStatusError(
                "Server Error",
                request=httpx.Request("GET", url),
                response=error_response,
            )
        return httpx.Response(
            200, json=MOCK_OPENKVK_RESPONSE, request=httpx.Request("GET", url)
        )

    with (
        patch("app.integrations.openkvk.httpx.AsyncClient") as mock_cls,
        patch("app.integrations.openkvk.asyncio.sleep", new_callable=AsyncMock),
    ):
        mock_client = AsyncMock()
        mock_client.get.side_effect = mock_get
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await OpenKvKClient._fetch("12345678")

    assert result == MOCK_OPENKVK_RESPONSE
    assert call_count == 2


@pytest.mark.asyncio
async def test_fetch_no_retry_on_client_error():
    """4xx errors (except 404) should raise immediately, not retry."""
    error_response = httpx.Response(403)

    with patch("app.integrations.openkvk.httpx.AsyncClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.HTTPStatusError(
            "Forbidden",
            request=httpx.Request("GET", "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/12345678"),
            response=error_response,
        )
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(httpx.HTTPStatusError):
            await OpenKvKClient._fetch("12345678")

    # Should have been called only once — no retry on 403
    assert mock_client.get.call_count == 1


@pytest.mark.asyncio
async def test_fetch_raises_after_max_retries():
    """After 3 failed attempts on server errors, the exception should propagate."""
    error_response = httpx.Response(502)

    with (
        patch("app.integrations.openkvk.httpx.AsyncClient") as mock_cls,
        patch("app.integrations.openkvk.asyncio.sleep", new_callable=AsyncMock),
    ):
        mock_client = AsyncMock()
        mock_client.get.side_effect = httpx.HTTPStatusError(
            "Bad Gateway",
            request=httpx.Request("GET", "https://opendata.kvk.nl/api/v1/hvds/basisbedrijfsgegevens/12345678"),
            response=error_response,
        )
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(httpx.HTTPStatusError):
            await OpenKvKClient._fetch("12345678")

    assert mock_client.get.call_count == 3
