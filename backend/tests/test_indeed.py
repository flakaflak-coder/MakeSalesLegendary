import pytest

from app.scrapers.indeed import IndeedResult, IndeedScraper


@pytest.fixture(autouse=True)
def setup_db():
    """Override the conftest autouse fixture — these tests need no database."""
    yield


MOCK_INDEED_HTML = """
<html><body>
<div class="job_seen_beacon">
  <h2 class="jobTitle"><a href="/viewjob?jk=abc123" data-jk="abc123">
    <span>Crediteurenadministrateur</span>
  </a></h2>
  <span data-testid="company-name">Acme B.V.</span>
  <div data-testid="text-location">Amsterdam</div>
</div>
<div class="job_seen_beacon">
  <h2 class="jobTitle"><a href="/viewjob?jk=def456" data-jk="def456">
    <span>AP Medewerker</span>
  </a></h2>
  <span data-testid="company-name">Globex Corp</span>
  <div data-testid="text-location">Rotterdam</div>
</div>
</body></html>
"""


def test_parse_indeed_html():
    scraper = IndeedScraper()
    results = scraper.parse_html(MOCK_INDEED_HTML)
    assert len(results) == 2
    assert results[0].company_name == "Acme B.V."
    assert results[0].job_title == "Crediteurenadministrateur"
    assert results[0].source == "indeed"
    assert "abc123" in results[0].external_id


def test_parse_indeed_empty_html():
    scraper = IndeedScraper()
    results = scraper.parse_html("<html><body></body></html>")
    assert results == []


def test_indeed_result_dataclass():
    result = IndeedResult(
        external_id="abc123",
        job_title="AP Clerk",
        company_name="Test Co",
        location="Amsterdam",
        job_url="https://indeed.nl/viewjob?jk=abc123",
        source="indeed",
    )
    assert result.source == "indeed"
