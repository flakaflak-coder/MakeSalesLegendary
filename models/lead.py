from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Lead:
    """A company detected as hiring for AP-related roles."""

    company_name: str
    job_title: str
    job_url: str

    # Company details
    company_size: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    company_linkedin_url: Optional[str] = None

    # Signal strength
    open_ap_roles_count: int = 1

    # Tracking
    first_detected: str = field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )
    last_seen: str = field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )

    # Internal deduplication key
    @property
    def dedup_key(self) -> str:
        return self.company_name.lower().strip()

    def to_sheet_row(self) -> list:
        return [
            self.company_name,
            self.company_size or "",
            self.industry or "",
            self.location or "",
            self.job_title,
            self.job_url,
            str(self.open_ap_roles_count),
            self.first_detected,
            self.last_seen,
            self.company_linkedin_url or "",
        ]

    @classmethod
    def sheet_headers(cls) -> list:
        return [
            "Company Name",
            "Company Size",
            "Industry",
            "Location",
            "Job Title (Signal)",
            "Job URL",
            "Open AP Roles (est.)",
            "First Detected",
            "Last Seen",
            "Company LinkedIn URL",
        ]
