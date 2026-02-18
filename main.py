"""
MakeSalesLegendary — AP Lead Finding Agent Network
===================================================

Orchestrates three agents in sequence:

  Agent 1 (Vacancy Scanner)  → finds companies hiring for AP roles
  Agent 2 (Persona Finder)   → finds the right contacts inside those companies
  Agent 3 (Outreach Agent)   → drafts personalised LinkedIn messages per persona

All results are stored in Google Sheets for review.

Usage:
    python main.py                     # Run full pipeline
    python main.py --agent 1           # Run only Vacancy Scanner
    python main.py --agent 2           # Run only Persona Finder (uses Sheet data)
    python main.py --agent 3           # Run only Outreach Agent (uses Sheet data)
    python main.py --location "Germany" --agent 1
"""

import argparse
import logging
import sys

from agents.outreach_agent import OutreachAgent
from agents.persona_finder import PersonaFinder
from agents.vacancy_scanner import VacancyScanner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("agent_run.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def run_full_pipeline(location: str) -> None:
    """Run all three agents end-to-end."""
    logger.info("Starting full pipeline — location: %s", location)

    # ── Agent 1: Vacancy Scanner ──────────────────────────────────────────────
    scanner = VacancyScanner(location=location)
    new_leads = scanner.run()

    if not new_leads:
        logger.info(
            "No new leads found. Checking Sheets for existing leads to process..."
        )

    # ── Agent 2: Persona Finder ───────────────────────────────────────────────
    # Pass new_leads; if empty, PersonaFinder falls back to reading from Sheet
    finder = PersonaFinder()
    new_personas = finder.run(leads=new_leads if new_leads else None)

    # ── Agent 3: Outreach Agent ───────────────────────────────────────────────
    # Pass new_personas + new_leads for context enrichment
    outreach = OutreachAgent()
    drafts = outreach.run(
        personas=new_personas if new_personas else None,
        leads=new_leads if new_leads else None,
    )

    # ── Summary ───────────────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("Pipeline complete.")
    logger.info("  New leads found    : %d", len(new_leads))
    logger.info("  New personas found : %d", len(new_personas))
    logger.info("  Outreach drafted   : %d", len(drafts))
    logger.info("  Results stored in Google Sheets.")
    logger.info("=" * 60)


def run_agent_1(location: str) -> None:
    scanner = VacancyScanner(location=location)
    leads = scanner.run()
    logger.info("Done. %d new lead(s) written to Vacancies sheet.", len(leads))


def run_agent_2() -> None:
    finder = PersonaFinder()
    personas = finder.run()
    logger.info(
        "Done. %d new persona(s) written to Personas sheet.", len(personas)
    )


def run_agent_3() -> None:
    outreach = OutreachAgent()
    drafts = outreach.run()
    logger.info(
        "Done. %d outreach draft(s) written to Outreach sheet.", len(drafts)
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MakeSalesLegendary — AP Lead Finding Agent Network"
    )
    parser.add_argument(
        "--agent",
        type=int,
        choices=[1, 2, 3],
        default=None,
        help="Run a specific agent only (1=Scanner, 2=Personas, 3=Outreach). "
             "Omit to run the full pipeline.",
    )
    parser.add_argument(
        "--location",
        type=str,
        default="Netherlands",
        help="Location filter for job search (default: Netherlands)",
    )
    args = parser.parse_args()

    if args.agent == 1:
        run_agent_1(location=args.location)
    elif args.agent == 2:
        run_agent_2()
    elif args.agent == 3:
        run_agent_3()
    else:
        run_full_pipeline(location=args.location)


if __name__ == "__main__":
    main()
