from app.scrapers.serpapi import SerpApiHarvester, SerpApiResult

MOCK_SERPAPI_RESPONSE = {
    "jobs_results": [
        {
            "title": "Crediteurenadministrateur",
            "company_name": "Acme B.V.",
            "location": "Amsterdam, Netherlands",
            "via": "via Indeed",
            "description": "Wij zoeken een ervaren crediteurenadministrateur...",
            "job_id": "abc123",
            "detected_extensions": {"posted_at": "2 days ago"},
            "apply_options": [{"link": "https://example.com/apply"}],
        },
        {
            "title": "AP Specialist",
            "company_name": "Globex Corporation",
            "location": "Rotterdam, Netherlands",
            "via": "via LinkedIn",
            "description": "We are looking for an AP specialist to join...",
            "job_id": "def456",
            "detected_extensions": {"posted_at": "30+ days ago"},
            "apply_options": [{"link": "https://example.com/apply2"}],
        },
    ]
}


def test_parse_serpapi_response():
    harvester = SerpApiHarvester(api_key="test")
    results = harvester.parse_response(MOCK_SERPAPI_RESPONSE)
    assert len(results) == 2
    assert results[0].company_name == "Acme B.V."
    assert results[0].job_title == "Crediteurenadministrateur"
    assert results[0].location == "Amsterdam, Netherlands"
    assert results[0].source == "google_jobs"
    assert results[0].external_id == "abc123"


def test_parse_serpapi_empty_response():
    harvester = SerpApiHarvester(api_key="test")
    results = harvester.parse_response({})
    assert results == []


def test_parse_serpapi_missing_fields():
    harvester = SerpApiHarvester(api_key="test")
    results = harvester.parse_response({"jobs_results": [{"title": "AP Clerk"}]})
    assert len(results) == 1
    assert results[0].company_name == ""
    assert results[0].job_title == "AP Clerk"


def test_serpapi_result_dataclass():
    result = SerpApiResult(
        external_id="abc123",
        job_title="AP Clerk",
        company_name="Test Co",
        location="Amsterdam",
        description="A job description",
        job_url="https://example.com",
        source="google_jobs",
        posted_at="2 days ago",
    )
    assert result.external_id == "abc123"
    assert result.source == "google_jobs"
