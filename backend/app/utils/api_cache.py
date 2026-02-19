"""File-based API response cache.

Stores raw API responses as JSON files in data/cache/ so they can be
committed to git and shared between developers. This saves API calls
and lets team members work with real data without needing API keys.

Cache files are organized by source:
    data/cache/serpapi/<hash>.json
    data/cache/kvk/<hash>.json
    data/cache/company_info/<hash>.json
    data/cache/claude_llm/<hash>.json
"""

import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# Default cache root relative to project root
_PROJECT_ROOT = Path(__file__).resolve().parents[3]  # backend/app/utils -> project root
CACHE_DIR = _PROJECT_ROOT / "data" / "cache"


def _cache_key(source: str, params: dict) -> Path:
    """Generate a deterministic file path for a cache entry."""
    serialized = json.dumps(params, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
    source_dir = CACHE_DIR / source
    source_dir.mkdir(parents=True, exist_ok=True)
    return source_dir / f"{digest}.json"


def cache_get(source: str, params: dict, max_age_days: int = 30) -> dict | None:
    """Read a cached API response if it exists and isn't too old.

    Args:
        source: Cache namespace (e.g. "serpapi", "kvk")
        params: Request parameters used as cache key
        max_age_days: Maximum age in days before cache is considered stale.
                      Set to 0 to never expire.

    Returns:
        The cached response dict, or None if not found/expired.
    """
    path = _cache_key(source, params)
    if not path.exists():
        return None

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read cache %s: %s", path, exc)
        return None

    # Check age
    if max_age_days > 0:
        cached_at = data.get("_cached_at")
        if cached_at:
            age = (datetime.now(UTC) - datetime.fromisoformat(cached_at)).days
            if age > max_age_days:
                logger.debug("Cache expired: %s (%d days old)", path.name, age)
                return None

    logger.debug("Cache hit: %s/%s", source, path.name)
    return data.get("response")


def cache_put(source: str, params: dict, response: dict) -> Path:
    """Store an API response in the file cache.

    Args:
        source: Cache namespace
        params: Request parameters used as cache key
        response: The API response to cache

    Returns:
        Path to the cache file.
    """
    path = _cache_key(source, params)
    data = {
        "_cached_at": datetime.now(UTC).isoformat(),
        "_params": params,
        "response": response,
    }
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    logger.debug("Cache stored: %s/%s", source, path.name)
    return path
