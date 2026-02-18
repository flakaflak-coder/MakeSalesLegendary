from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Persona:
    """A contact found inside a target company."""

    company_name: str
    full_name: str
    job_title: str

    # Contact details
    linkedin_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    # Classification
    persona_type: str = "influencer"  # decision_maker | champion | influencer

    # Activity signals (from Apollo / LinkedIn)
    recent_activity: Optional[str] = None
    last_job_change: Optional[str] = None

    # Preferred outreach channel
    preferred_channel: str = "linkedin"  # linkedin | email

    # Tracking
    found_at: str = field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )

    def to_sheet_row(self) -> list:
        return [
            self.company_name,
            self.full_name,
            self.job_title,
            self.persona_type,
            self.linkedin_url or "",
            self.email or "",
            self.phone or "",
            self.preferred_channel,
            self.recent_activity or "",
            self.last_job_change or "",
            self.found_at,
        ]

    @classmethod
    def sheet_headers(cls) -> list:
        return [
            "Company Name",
            "Full Name",
            "Job Title",
            "Persona Type",
            "LinkedIn URL",
            "Email",
            "Phone",
            "Preferred Channel",
            "Recent Activity",
            "Last Job Change",
            "Found At",
        ]


@dataclass
class OutreachDraft:
    """A personalised outreach message drafted by the Outreach Agent."""

    company_name: str
    persona_name: str
    persona_title: str
    channel: str  # linkedin | email

    subject: Optional[str] = None  # for email
    message: str = ""

    # Context used to generate the message
    vacancy_signal: Optional[str] = None
    persona_type: Optional[str] = None

    # Tracking
    drafted_at: str = field(
        default_factory=lambda: datetime.utcnow().isoformat()
    )
    status: str = "draft"  # draft | sent | replied

    def to_sheet_row(self) -> list:
        return [
            self.company_name,
            self.persona_name,
            self.persona_title,
            self.persona_type or "",
            self.channel,
            self.subject or "",
            self.message,
            self.vacancy_signal or "",
            self.drafted_at,
            self.status,
        ]

    @classmethod
    def sheet_headers(cls) -> list:
        return [
            "Company Name",
            "Persona Name",
            "Persona Title",
            "Persona Type",
            "Channel",
            "Subject (email)",
            "Message",
            "Vacancy Signal",
            "Drafted At",
            "Status",
        ]
