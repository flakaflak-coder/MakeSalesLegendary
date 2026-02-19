import pytest

from app.services.dedup import find_or_create_company, normalize_company_name


def test_normalize_strips_legal_suffixes():
    assert normalize_company_name("Acme B.V.") == "acme"
    assert normalize_company_name("Globex N.V.") == "globex"
    assert normalize_company_name("Test BV") == "test"
    assert normalize_company_name("Widget NV") == "widget"


def test_normalize_strips_whitespace_and_punctuation():
    assert normalize_company_name("  Acme Corp.  ") == "acme corp"
    assert normalize_company_name("Foo & Bar") == "foo bar"
    assert normalize_company_name("ABC - XYZ") == "abc xyz"


def test_normalize_handles_common_suffixes():
    assert normalize_company_name("Tech Solutions B.V.") == "tech solutions"
    assert normalize_company_name("InnoGroup Holding B.V.") == "innogroup holding"
    assert normalize_company_name("Digital Services GmbH") == "digital services"
    assert normalize_company_name("Consulting Ltd.") == "consulting"


def test_normalize_empty_and_whitespace():
    assert normalize_company_name("") == ""
    assert normalize_company_name("   ") == ""


@pytest.mark.asyncio
async def test_find_or_create_company_creates_new(db_session):
    company = await find_or_create_company(db_session, "Acme B.V.")
    assert company.id is not None
    assert company.name == "Acme B.V."
    assert company.normalized_name == "acme"


@pytest.mark.asyncio
async def test_find_or_create_company_deduplicates(db_session):
    company1 = await find_or_create_company(db_session, "Acme B.V.")
    company2 = await find_or_create_company(db_session, "Acme BV")
    company3 = await find_or_create_company(db_session, " acme b.v. ")
    assert company1.id == company2.id == company3.id


@pytest.mark.asyncio
async def test_find_or_create_preserves_original_name(db_session):
    company = await find_or_create_company(db_session, "Acme B.V.")
    assert company.name == "Acme B.V."
    # Second call with different casing doesn't overwrite
    company2 = await find_or_create_company(db_session, "ACME bv")
    assert company2.name == "Acme B.V."
