"""Parse relative date strings like '3 days ago' into datetime objects."""

import re
from datetime import UTC, datetime, timedelta

# Patterns: "3 days ago", "2 weken geleden", "vandaag", "30+ days ago"
_RELATIVE_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Dutch
    (re.compile(r"(\d+)\+?\s*dag(?:en)?\s*geleden", re.IGNORECASE), "days"),
    (re.compile(r"(\d+)\+?\s*(?:week|weken)\s*geleden", re.IGNORECASE), "weeks"),
    (re.compile(r"(\d+)\+?\s*(?:maand|maanden)\s*geleden", re.IGNORECASE), "months"),
    (re.compile(r"(\d+)\+?\s*uur?\s*geleden", re.IGNORECASE), "hours"),
    # English
    (re.compile(r"(\d+)\+?\s*days?\s*ago", re.IGNORECASE), "days"),
    (re.compile(r"(\d+)\+?\s*weeks?\s*ago", re.IGNORECASE), "weeks"),
    (re.compile(r"(\d+)\+?\s*months?\s*ago", re.IGNORECASE), "months"),
    (re.compile(r"(\d+)\+?\s*hours?\s*ago", re.IGNORECASE), "hours"),
]

_TODAY_PATTERNS = re.compile(
    r"^(today|vandaag|just posted|net geplaatst|zojuist)$", re.IGNORECASE
)
_YESTERDAY_PATTERNS = re.compile(r"^(yesterday|gisteren)$", re.IGNORECASE)


def parse_relative_date(text: str, now: datetime | None = None) -> datetime | None:
    """Parse a relative date string into a datetime.

    Supports English and Dutch relative date formats commonly returned
    by job boards (Google Jobs, Indeed, LinkedIn).

    Returns None if the string cannot be parsed.
    """
    if not text:
        return None

    text = text.strip()
    if now is None:
        now = datetime.now(UTC)

    if _TODAY_PATTERNS.match(text):
        return now

    if _YESTERDAY_PATTERNS.match(text):
        return now - timedelta(days=1)

    for pattern, unit in _RELATIVE_PATTERNS:
        match = pattern.search(text)
        if match:
            value = int(match.group(1))
            if unit == "hours":
                return now - timedelta(hours=value)
            elif unit == "days":
                return now - timedelta(days=value)
            elif unit == "weeks":
                return now - timedelta(weeks=value)
            elif unit == "months":
                return now - timedelta(days=value * 30)
            break

    return None
