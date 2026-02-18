"""
Agent 3 — Outreach Agent

Crafts personalised LinkedIn messages for each persona, tying the
company's AP hiring signal directly to Freeday's value proposition.
Tone and angle are tailored per persona type (decision maker / champion / influencer).
"""

import json
import logging
from typing import Optional

import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, FREEDAY_VALUE_PROP
from models.lead import Lead
from models.persona import OutreachDraft, Persona
from tools import google_sheets

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# LinkedIn message hard limit (connection request note = 300 chars; InMail = ~2000)
LINKEDIN_MAX_CHARS = 300


class OutreachAgent:
    """
    Uses Claude to draft personalised outreach messages for each persona.
    Messages are stored in the Outreach sheet for human review before sending.
    """

    def run(
        self,
        personas: Optional[list[Persona]] = None,
        leads: Optional[list[Lead]] = None,
    ) -> list[OutreachDraft]:
        """
        Draft outreach for the given personas. If personas is None, reads
        from the Personas sheet.

        leads is used to enrich context (company size, open AP role count).
        Returns all drafted messages.
        """
        logger.info("=== Agent 3: Outreach Agent starting ===")

        if personas is None:
            personas = self._load_personas_from_sheet()

        if not personas:
            logger.warning("No personas to process — Outreach Agent exiting.")
            return []

        # Build a lookup: company_name (lower) → Lead for context enrichment
        lead_lookup: dict[str, Lead] = {}
        if leads:
            for lead in leads:
                lead_lookup[lead.company_name.lower()] = lead

        drafts: list[OutreachDraft] = []

        for persona in personas:
            lead = lead_lookup.get(persona.company_name.lower())
            draft = self._draft_message(persona, lead)
            if draft:
                drafts.append(draft)

        if drafts:
            google_sheets.write_outreach_drafts(drafts)

        logger.info(
            "=== Agent 3 complete — %d outreach draft(s) written. ===",
            len(drafts),
        )
        return drafts

    def _draft_message(
        self, persona: Persona, lead: Optional[Lead]
    ) -> Optional[OutreachDraft]:
        """Ask Claude to write a personalised LinkedIn connection message."""

        # Build context string
        vacancy_signal = (
            f"{lead.open_ap_roles_count} open AP role(s) detected "
            f"(e.g. '{lead.job_title}') at {persona.company_name}"
            if lead
            else f"AP hiring detected at {persona.company_name}"
        )

        company_context = ""
        if lead:
            parts = []
            if lead.industry:
                parts.append(f"industry: {lead.industry}")
            if lead.company_size:
                parts.append(f"size: {lead.company_size} employees")
            if lead.location:
                parts.append(f"location: {lead.location}")
            if parts:
                company_context = f"Company context — {', '.join(parts)}."

        persona_activity = ""
        if persona.recent_activity:
            persona_activity = (
                f"Recent activity / headline: \"{persona.recent_activity}\"."
            )

        prompt = f"""You are a sales development representative at Freeday.
Freeday builds AI Digital Workers that automate Accounts Payable (AP) processes.

{FREEDAY_VALUE_PROP}

Write a SHORT, personalised LinkedIn connection request note (max {LINKEDIN_MAX_CHARS} characters) for:

Recipient:
- Name: {persona.full_name}
- Title: {persona.job_title}
- Company: {persona.company_name}
- Persona type: {persona.persona_type}  (decision_maker | champion | influencer)
{persona_activity}

Buying signal:
- {vacancy_signal}
{company_context}

Tone guidelines per persona type:
- decision_maker (CFO / Finance Director): strategic ROI framing, talk about cost reduction and business impact
- champion (Head of AP / AP Manager): operational pain relief, talk about reducing manual work and exceptions
- influencer (Shared Services / Finance Ops): efficiency and compliance angle

Rules:
- Do NOT use generic openers like "I hope this message finds you well"
- Reference the specific hiring signal naturally (they are hiring AP staff → Freeday can help automate instead)
- Keep it under {LINKEDIN_MAX_CHARS} characters — this is a connection request note, not an essay
- End with a low-friction call to action (e.g. "Would love to share how — open to a quick chat?")
- Write only the message text, no subject line, no markdown, no explanation

Return ONLY valid JSON in this exact shape:
{{"message": "<the linkedin note text>"}}"""

        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            parsed = json.loads(raw)
            message_text = parsed.get("message", "").strip()
        except json.JSONDecodeError:
            # Fallback: use raw text if JSON parsing fails
            message_text = response.content[0].text.strip()
        except Exception as exc:
            logger.error(
                "Claude API error for %s @ %s: %s",
                persona.full_name,
                persona.company_name,
                exc,
            )
            return None

        if not message_text:
            logger.warning(
                "Empty message generated for %s @ %s",
                persona.full_name,
                persona.company_name,
            )
            return None

        # Trim to hard LinkedIn limit
        if len(message_text) > LINKEDIN_MAX_CHARS:
            message_text = message_text[: LINKEDIN_MAX_CHARS - 1] + "…"

        logger.info(
            "Drafted message for %s @ %s (%d chars)",
            persona.full_name,
            persona.company_name,
            len(message_text),
        )

        return OutreachDraft(
            company_name=persona.company_name,
            persona_name=persona.full_name,
            persona_title=persona.job_title,
            channel=persona.preferred_channel,
            message=message_text,
            vacancy_signal=vacancy_signal,
            persona_type=persona.persona_type,
        )

    def _load_personas_from_sheet(self) -> list[Persona]:
        """Read personas from Google Sheets and convert to Persona objects."""
        records = google_sheets.get_all_personas()
        personas = []
        for r in records:
            personas.append(
                Persona(
                    company_name=r.get("Company Name", ""),
                    full_name=r.get("Full Name", ""),
                    job_title=r.get("Job Title", ""),
                    persona_type=r.get("Persona Type", "influencer"),
                    linkedin_url=r.get("LinkedIn URL") or None,
                    email=r.get("Email") or None,
                    phone=r.get("Phone") or None,
                    preferred_channel=r.get("Preferred Channel", "linkedin"),
                    recent_activity=r.get("Recent Activity") or None,
                    last_job_change=r.get("Last Job Change") or None,
                    found_at=r.get("Found At", ""),
                )
            )
        return [p for p in personas if p.full_name and p.company_name]
