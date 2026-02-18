"""
Google Sheets integration via gspread.
Handles reading and writing for all three sheets:
  - Vacancies  (Agent 1 output)
  - Personas   (Agent 2 output)
  - Outreach   (Agent 3 output)
"""

import logging
from typing import Optional

import gspread
from google.oauth2.service_account import Credentials

from config import (
    GOOGLE_SHEETS_CREDENTIALS_FILE,
    GOOGLE_SHEETS_SPREADSHEET_ID,
    SHEET_OUTREACH,
    SHEET_PERSONAS,
    SHEET_VACANCIES,
)
from models.lead import Lead
from models.persona import OutreachDraft, Persona

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def _get_client() -> gspread.Client:
    creds = Credentials.from_service_account_file(
        GOOGLE_SHEETS_CREDENTIALS_FILE, scopes=SCOPES
    )
    return gspread.authorize(creds)


def _get_or_create_sheet(
    spreadsheet: gspread.Spreadsheet, title: str, headers: list
) -> gspread.Worksheet:
    try:
        ws = spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=title, rows=1000, cols=len(headers))
        ws.append_row(headers, value_input_option="RAW")
        logger.info("Created sheet tab: %s", title)
    return ws


# ── Vacancies ──────────────────────────────────────────────────────────────────

def get_existing_company_names() -> set[str]:
    """Return the set of company names already stored in the Vacancies sheet."""
    try:
        client = _get_client()
        ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
        ws = _get_or_create_sheet(ss, SHEET_VACANCIES, Lead.sheet_headers())
        records = ws.get_all_records()
        return {r.get("Company Name", "").lower().strip() for r in records}
    except Exception as exc:
        logger.error("Failed to read existing companies: %s", exc)
        return set()


def write_leads(leads: list[Lead]) -> int:
    """
    Append new leads to the Vacancies sheet.
    Returns the number of rows written.
    """
    if not leads:
        return 0
    client = _get_client()
    ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
    ws = _get_or_create_sheet(ss, SHEET_VACANCIES, Lead.sheet_headers())

    existing = get_existing_company_names()
    new_leads = [l for l in leads if l.dedup_key not in existing]

    rows = [l.to_sheet_row() for l in new_leads]
    if rows:
        ws.append_rows(rows, value_input_option="RAW")
        logger.info("Wrote %d new lead(s) to Vacancies sheet.", len(rows))
    else:
        logger.info("No new leads to write — all companies already exist.")
    return len(rows)


def update_lead_last_seen(company_name: str, last_seen: str) -> None:
    """Update the 'Last Seen' column for an existing company."""
    try:
        client = _get_client()
        ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
        ws = ss.worksheet(SHEET_VACANCIES)
        headers = ws.row_values(1)
        col_company = headers.index("Company Name") + 1
        col_last_seen = headers.index("Last Seen") + 1
        col_values = ws.col_values(col_company)
        for i, val in enumerate(col_values[1:], start=2):  # skip header
            if val.lower().strip() == company_name.lower().strip():
                ws.update_cell(i, col_last_seen, last_seen)
                break
    except Exception as exc:
        logger.error("Failed to update last_seen for %s: %s", company_name, exc)


# ── Personas ───────────────────────────────────────────────────────────────────

def get_existing_persona_keys() -> set[str]:
    """Return set of 'company|name' keys already in the Personas sheet."""
    try:
        client = _get_client()
        ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
        ws = _get_or_create_sheet(ss, SHEET_PERSONAS, Persona.sheet_headers())
        records = ws.get_all_records()
        return {
            f"{r.get('Company Name','').lower()}|{r.get('Full Name','').lower()}"
            for r in records
        }
    except Exception as exc:
        logger.error("Failed to read existing personas: %s", exc)
        return set()


def write_personas(personas: list[Persona]) -> int:
    """Append new personas to the Personas sheet."""
    if not personas:
        return 0
    client = _get_client()
    ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
    ws = _get_or_create_sheet(ss, SHEET_PERSONAS, Persona.sheet_headers())

    existing = get_existing_persona_keys()
    new_personas = [
        p for p in personas
        if f"{p.company_name.lower()}|{p.full_name.lower()}" not in existing
    ]

    rows = [p.to_sheet_row() for p in new_personas]
    if rows:
        ws.append_rows(rows, value_input_option="RAW")
        logger.info("Wrote %d new persona(s) to Personas sheet.", len(rows))
    return len(rows)


# ── Outreach ───────────────────────────────────────────────────────────────────

def write_outreach_drafts(drafts: list[OutreachDraft]) -> int:
    """Append outreach drafts to the Outreach sheet."""
    if not drafts:
        return 0
    client = _get_client()
    ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
    ws = _get_or_create_sheet(ss, SHEET_OUTREACH, OutreachDraft.sheet_headers())

    rows = [d.to_sheet_row() for d in drafts]
    ws.append_rows(rows, value_input_option="RAW")
    logger.info("Wrote %d outreach draft(s) to Outreach sheet.", len(rows))
    return len(rows)


def get_all_leads() -> list[dict]:
    """Return all rows from the Vacancies sheet as dicts."""
    try:
        client = _get_client()
        ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
        ws = _get_or_create_sheet(ss, SHEET_VACANCIES, Lead.sheet_headers())
        return ws.get_all_records()
    except Exception as exc:
        logger.error("Failed to read leads: %s", exc)
        return []


def get_all_personas() -> list[dict]:
    """Return all rows from the Personas sheet as dicts."""
    try:
        client = _get_client()
        ss = client.open_by_key(GOOGLE_SHEETS_SPREADSHEET_ID)
        ws = _get_or_create_sheet(ss, SHEET_PERSONAS, Persona.sheet_headers())
        return ws.get_all_records()
    except Exception as exc:
        logger.error("Failed to read personas: %s", exc)
        return []
