import os
from dotenv import load_dotenv

load_dotenv()

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = "claude-sonnet-4-6"

# RapidAPI (LinkedIn Jobs)
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST_LINKEDIN_JOBS = "linkedin-job-search-api.p.rapidapi.com"

# Apollo.io
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY")
APOLLO_BASE_URL = "https://api.apollo.io/v1"

# Google Sheets
GOOGLE_SHEETS_CREDENTIALS_FILE = os.getenv(
    "GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json"
)
GOOGLE_SHEETS_SPREADSHEET_ID = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")

# Sheet tab names
SHEET_VACANCIES = "Vacancies"
SHEET_PERSONAS = "Personas"
SHEET_OUTREACH = "Outreach"

# AP-related job titles to scan for
AP_JOB_TITLES = [
    "Accounts Payable Specialist",
    "AP Specialist",
    "AP Clerk",
    "Accounts Payable Clerk",
    "Invoice Processing",
    "AP Manager",
    "Accounts Payable Manager",
    "Accounts Payable Coordinator",
]

# Target persona titles (for Apollo search)
TARGET_PERSONA_TITLES = [
    "CFO",
    "Chief Financial Officer",
    "Finance Director",
    "Head of Accounts Payable",
    "AP Manager",
    "Head of Finance Operations",
    "Finance Operations Manager",
    "Shared Services Director",
]

# Persona classification map
DECISION_MAKER_TITLES = {"CFO", "Chief Financial Officer", "Finance Director"}
CHAMPION_TITLES = {
    "Head of Accounts Payable",
    "AP Manager",
    "Accounts Payable Manager",
    "Head of Finance Operations",
    "Finance Operations Manager",
}
INFLUENCER_TITLES = {"Shared Services Director", "Controller", "VP Finance"}

# Freeday value proposition (used by Outreach Agent)
FREEDAY_VALUE_PROP = """
Freeday builds AI Digital Workers that automate Accounts Payable processes end-to-end:
- Automated invoice intake (email, portal, PDF)
- AI-powered matching and coding
- Exception handling with human-in-the-loop escalation
- Real-time dashboards and audit trails
- Typical results: 70-90% reduction in manual AP processing time, ROI within 3-6 months

Freeday integrates with major ERPs (SAP, Oracle, Microsoft Dynamics, NetSuite)
and is live with customers across finance, logistics, and healthcare.
"""
