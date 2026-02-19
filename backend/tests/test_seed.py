import pytest

from app.services.seed import load_profile_yaml, seed_profile


def test_load_profile_yaml():
    data = load_profile_yaml("accounts_payable")
    assert data["profile"]["name"] == "Accounts Payable"
    assert data["profile"]["slug"] == "ap"
    terms = data["profile"]["search_terms"]
    assert "primary" in terms
    assert len(terms["primary"]) == 4


@pytest.mark.asyncio
async def test_seed_profile_creates_records(db_session):
    profile = await seed_profile(db_session, "accounts_payable")
    assert profile.name == "Accounts Payable"
    assert profile.slug == "ap"
    # 4 primary + 5 secondary + 3 seniority = 12 terms
    assert len(profile.search_terms) == 12


@pytest.mark.asyncio
async def test_seed_profile_is_idempotent(db_session):
    profile1 = await seed_profile(db_session, "accounts_payable")
    profile2 = await seed_profile(db_session, "accounts_payable")
    assert profile1.id == profile2.id
