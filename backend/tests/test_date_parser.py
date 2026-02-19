"""Tests for relative date string parsing."""

from datetime import UTC, datetime, timedelta

from app.utils.date_parser import parse_relative_date

NOW = datetime(2026, 2, 19, 12, 0, 0, tzinfo=UTC)


def test_parse_days_ago_english():
    result = parse_relative_date("3 days ago", now=NOW)
    assert result == NOW - timedelta(days=3)


def test_parse_days_ago_dutch():
    result = parse_relative_date("5 dagen geleden", now=NOW)
    assert result == NOW - timedelta(days=5)


def test_parse_weeks_ago():
    result = parse_relative_date("2 weeks ago", now=NOW)
    assert result == NOW - timedelta(weeks=2)


def test_parse_weeks_ago_dutch():
    result = parse_relative_date("3 weken geleden", now=NOW)
    assert result == NOW - timedelta(weeks=3)


def test_parse_months_ago():
    result = parse_relative_date("2 months ago", now=NOW)
    assert result == NOW - timedelta(days=60)


def test_parse_months_ago_dutch():
    result = parse_relative_date("1 maand geleden", now=NOW)
    assert result == NOW - timedelta(days=30)


def test_parse_hours_ago():
    result = parse_relative_date("5 hours ago", now=NOW)
    assert result == NOW - timedelta(hours=5)


def test_parse_hours_ago_dutch():
    result = parse_relative_date("3 uur geleden", now=NOW)
    assert result == NOW - timedelta(hours=3)


def test_parse_today():
    result = parse_relative_date("today", now=NOW)
    assert result == NOW


def test_parse_vandaag():
    result = parse_relative_date("vandaag", now=NOW)
    assert result == NOW


def test_parse_just_posted():
    result = parse_relative_date("Just posted", now=NOW)
    assert result == NOW


def test_parse_yesterday():
    result = parse_relative_date("yesterday", now=NOW)
    assert result == NOW - timedelta(days=1)


def test_parse_gisteren():
    result = parse_relative_date("gisteren", now=NOW)
    assert result == NOW - timedelta(days=1)


def test_parse_30_plus_days():
    """Google Jobs uses '30+ days ago' format."""
    result = parse_relative_date("30+ days ago", now=NOW)
    assert result == NOW - timedelta(days=30)


def test_parse_empty_string():
    assert parse_relative_date("") is None


def test_parse_none():
    assert parse_relative_date(None) is None


def test_parse_unknown_format():
    assert parse_relative_date("February 19, 2026") is None


def test_parse_singular_day():
    result = parse_relative_date("1 day ago", now=NOW)
    assert result == NOW - timedelta(days=1)


def test_parse_singular_week():
    result = parse_relative_date("1 week ago", now=NOW)
    assert result == NOW - timedelta(weeks=1)
