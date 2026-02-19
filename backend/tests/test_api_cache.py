"""Tests for the file-based API response cache."""

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from app.utils.api_cache import cache_get, cache_put


def test_cache_put_and_get(tmp_path):
    """Test basic cache write and read."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        params = {"query": "test", "location": "NL"}
        response = {"jobs_results": [{"title": "AP Medewerker"}]}

        cache_put("serpapi", params, response)
        result = cache_get("serpapi", params)

        assert result == response


def test_cache_miss_returns_none(tmp_path):
    """Test that a cache miss returns None."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        result = cache_get("serpapi", {"query": "nonexistent"})
        assert result is None


def test_cache_different_params_different_files(tmp_path):
    """Test that different params create different cache entries."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        cache_put("serpapi", {"query": "A"}, {"data": "result_a"})
        cache_put("serpapi", {"query": "B"}, {"data": "result_b"})

        assert cache_get("serpapi", {"query": "A"}) == {"data": "result_a"}
        assert cache_get("serpapi", {"query": "B"}) == {"data": "result_b"}


def test_cache_expiry(tmp_path):
    """Test that expired cache entries return None."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        params = {"query": "old"}
        response = {"data": "old_result"}

        # Write cache entry with old timestamp
        from app.utils.api_cache import _cache_key

        path = _cache_key("serpapi", params)
        old_date = (datetime.now(UTC) - timedelta(days=31)).isoformat()
        path.write_text(json.dumps({
            "_cached_at": old_date,
            "_params": params,
            "response": response,
        }))

        # Should be expired with 30 day max age
        assert cache_get("serpapi", params, max_age_days=30) is None

        # Should still be valid with 0 (never expire)
        assert cache_get("serpapi", params, max_age_days=0) == response


def test_cache_creates_source_directories(tmp_path):
    """Test that cache creates subdirectories per source."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        cache_put("kvk", {"kvk": "12345"}, {"name": "Test BV"})
        cache_put("company_info", {"kvk": "12345"}, {"revenue": "1M"})

        assert (tmp_path / "kvk").is_dir()
        assert (tmp_path / "company_info").is_dir()


def test_cache_stores_metadata(tmp_path):
    """Test that cache files include metadata."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        params = {"query": "test"}
        cache_put("serpapi", params, {"data": "result"})

        # Read raw file
        from app.utils.api_cache import _cache_key

        path = _cache_key("serpapi", params)
        raw = json.loads(path.read_text())

        assert "_cached_at" in raw
        assert raw["_params"] == params
        assert raw["response"] == {"data": "result"}


def test_cache_deterministic_keys(tmp_path):
    """Test that the same params always produce the same cache key."""
    with patch("app.utils.api_cache.CACHE_DIR", tmp_path):
        from app.utils.api_cache import _cache_key

        key1 = _cache_key("serpapi", {"a": 1, "b": 2})
        key2 = _cache_key("serpapi", {"b": 2, "a": 1})  # Different order

        assert key1 == key2  # Same key regardless of dict order
