def employee_count_to_range(count: int) -> str:
    """Convert a numeric employee count to a range string."""
    if count < 10:
        return "1-9"
    elif count < 50:
        return "10-49"
    elif count < 100:
        return "50-99"
    elif count < 200:
        return "100-199"
    elif count < 500:
        return "200-499"
    elif count < 1000:
        return "500-999"
    else:
        return "1000+"


def revenue_to_range(revenue: int) -> str:
    """Convert a numeric revenue value to a range string."""
    if revenue < 1_000_000:
        return "<1M"
    elif revenue < 10_000_000:
        return "1M-10M"
    elif revenue < 50_000_000:
        return "10M-50M"
    elif revenue < 100_000_000:
        return "50M-100M"
    elif revenue < 500_000_000:
        return "100M-500M"
    else:
        return "500M+"
