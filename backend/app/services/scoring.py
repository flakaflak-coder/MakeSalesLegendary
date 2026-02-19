import logging
from datetime import UTC, datetime

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.lead import Lead, ScoringConfig
from app.models.vacancy import Vacancy

logger = logging.getLogger(__name__)


def _vacancy_age_date(v: Vacancy) -> datetime:
    """Get the best available date for vacancy age calculation.

    Prefers published_at (actual publication date from source) over
    first_seen_at (when we first scraped it).
    """
    dt = v.published_at if v.published_at is not None else v.first_seen_at
    # Ensure timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


# Default scoring config used when no ScoringConfig row exists in the DB
DEFAULT_FIT_CRITERIA: dict = {
    "employee_count": {
        "weight": 0.20,
        "thresholds": {
            "1-9": 10,
            "10-49": 25,
            "50-99": 45,
            "100-199": 65,
            "200-499": 80,
            "500-999": 90,
            "1000+": 100,
        },
    },
    "entity_count": {
        "weight": 0.20,
        "thresholds": [
            {"min": 1, "max": 2, "score": 20},
            {"min": 3, "max": 5, "score": 50},
            {"min": 6, "max": 20, "score": 80},
            {"min": 21, "max": 999, "score": 100},
        ],
    },
    "erp_compatibility": {
        "weight": 0.15,
        "scores": {
            "excel": 20,
            "afas": 50,
            "exact": 50,
            "twinfield": 50,
            "sap": 90,
            "oracle": 90,
            "unit4": 70,
            "microsoft dynamics": 80,
            "netsuite": 85,
        },
    },
    "no_existing_automation": {
        "weight": 0.15,
        "scores": {"has_tool": 10, "unknown": 50, "confirmed_none": 90},
    },
    "revenue": {
        "weight": 0.15,
        "thresholds": {
            "<1M": 10,
            "1M-10M": 30,
            "10M-50M": 60,
            "50M-100M": 80,
            "100M-500M": 90,
            "500M+": 100,
        },
    },
    "sector_fit": {
        "weight": 0.10,
        "preferred_sbi_prefixes": [
            "41",
            "42",
            "43",
            "46",
            "47",
            "62",
            "63",
            "69",
            "70",
        ],
    },
    "multi_language": {
        "weight": 0.05,
        "scores": {"single": 20, "multi": 80},
    },
}

# Minimum company size filters — companies below these are auto-excluded.
# For Freeday AP: need 50K+ invoices/year → typically 200+ employees.
# Configurable per profile via ScoringConfig.score_thresholds.minimum_filters.
DEFAULT_MINIMUM_FILTERS: dict = {
    "employee_count": {
        "enabled": False,
        "min_range": "50-99",  # minimum employee range to qualify
        "range_order": [
            "1-9",
            "10-49",
            "50-99",
            "100-199",
            "200-499",
            "500-999",
            "1000+",
        ],
    },
    "revenue": {
        "enabled": False,  # not always available; enabled when enriched
        "min_range": "10M-50M",
        "range_order": [
            "<1M",
            "1M-10M",
            "10M-50M",
            "50M-100M",
            "100M-500M",
            "500M+",
        ],
    },
}

# Excluded company types — staffing agencies, recruiters, etc.
# These are not real end-customers; they post vacancies on behalf of clients.
DEFAULT_EXCLUDED_COMPANY_TYPES: dict = {
    "enabled": True,
    "excluded_sbi_prefixes": [
        "78",  # 7810 arbeidsbemiddeling, 7820 uitzendbureau, 7830 detachering
    ],
    "excluded_name_keywords": [
        "detachering",
        "uitzend",
        "staffing",
        "recruitment",
        "interim",
        "payroll",
        "werving",
        "selectie",
        "flexwerk",
        "talent connect",
        "randstad",
        "tempo-team",
        "manpower",
        "adecco",
        "hays",
        "brunel",
        "yacht",
        "michael page",
        "robert half",
        "robert walters",
    ],
}

DEFAULT_TIMING_SIGNALS: dict = {
    "vacancy_age_over_60_days": 3,
    "multiple_vacancies_same_role": 4,
    "repeated_publication": 3,
    "multi_platform": 2,
    "management_vacancy": 2,
}


class ScoringService:
    """Scoring engine that computes fit + timing scores for leads."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def score_profile(self, profile_id: int) -> dict:
        """Score all companies with active vacancies for a profile.

        Returns summary stats about the scoring run.
        """
        config = await self._get_scoring_config(profile_id)

        # Find all companies with active vacancies for this profile
        result = await self.db.execute(
            select(distinct(Vacancy.company_id)).where(
                Vacancy.search_profile_id == profile_id,
                Vacancy.company_id.isnot(None),
                Vacancy.status == "active",
            )
        )
        company_ids = [row[0] for row in result.all()]

        if not company_ids:
            logger.info("No companies to score for profile %d", profile_id)
            return {"scored": 0, "hot": 0, "warm": 0, "monitor": 0}

        stats: dict = {"scored": 0, "hot": 0, "warm": 0, "monitor": 0, "excluded": 0}

        for company_id in company_ids:
            lead = await self._score_company(company_id, profile_id, config)
            if lead:
                stats["scored"] += 1
                if lead.status in stats:
                    stats[lead.status] += 1

        await self.db.commit()
        logger.info(
            "Scored %d companies for profile %d: "
            "%d hot, %d warm, %d monitor, %d excluded",
            stats["scored"],
            profile_id,
            stats["hot"],
            stats["warm"],
            stats["monitor"],
            stats["excluded"],
        )
        return stats

    async def score_single_company(
        self, company_id: int, profile_id: int
    ) -> Lead | None:
        """Score a single company and return the lead."""
        config = await self._get_scoring_config(profile_id)
        lead = await self._score_company(company_id, profile_id, config)
        await self.db.commit()
        return lead

    async def _get_scoring_config(self, profile_id: int) -> dict:
        """Load active scoring config or return defaults."""
        result = await self.db.execute(
            select(ScoringConfig).where(
                ScoringConfig.profile_id == profile_id,
                ScoringConfig.is_active == True,  # noqa: E712
            )
        )
        config = result.scalar_one_or_none()

        if config:
            thresholds = config.score_thresholds or {
                "hot": 75,
                "warm": 50,
                "monitor": 25,
            }
            return {
                "fit_weight": config.fit_weight,
                "timing_weight": config.timing_weight,
                "fit_criteria": config.fit_criteria or DEFAULT_FIT_CRITERIA,
                "timing_signals": config.timing_signals or DEFAULT_TIMING_SIGNALS,
                "score_thresholds": thresholds,
                "minimum_filters": thresholds.get(
                    "minimum_filters", DEFAULT_MINIMUM_FILTERS
                ),
                "excluded_company_types": thresholds.get(
                    "excluded_company_types", DEFAULT_EXCLUDED_COMPANY_TYPES
                ),
            }

        return {
            "fit_weight": 0.6,
            "timing_weight": 0.4,
            "fit_criteria": DEFAULT_FIT_CRITERIA,
            "timing_signals": DEFAULT_TIMING_SIGNALS,
            "score_thresholds": {"hot": 75, "warm": 50, "monitor": 25},
            "minimum_filters": DEFAULT_MINIMUM_FILTERS,
            "excluded_company_types": DEFAULT_EXCLUDED_COMPANY_TYPES,
        }

    async def _score_company(
        self, company_id: int, profile_id: int, config: dict
    ) -> Lead | None:
        """Score a single company and create/update its lead record."""
        # Load company
        result = await self.db.execute(select(Company).where(Company.id == company_id))
        company = result.scalar_one_or_none()
        if not company:
            return None

        # Check excluded company types (staffing agencies, recruiters, etc.)
        excluded_reason = self._check_excluded_company_types(
            company, config.get("excluded_company_types", {})
        )
        if excluded_reason:
            return await self._mark_excluded(company_id, profile_id, excluded_reason)

        # Check minimum company size filters (only when enrichment data exists)
        excluded_reason = self._check_minimum_filters(
            company, config.get("minimum_filters", {})
        )
        if excluded_reason:
            return await self._mark_excluded(company_id, profile_id, excluded_reason)

        # Load active vacancies for this company + profile
        result = await self.db.execute(
            select(Vacancy).where(
                Vacancy.company_id == company_id,
                Vacancy.search_profile_id == profile_id,
                Vacancy.status == "active",
            )
        )
        vacancies = list(result.scalars().all())
        if not vacancies:
            return None

        # Compute scores
        fit_result = self._compute_fit_score(company, vacancies, config["fit_criteria"])
        timing_result = self._compute_timing_score(vacancies, config["timing_signals"])

        fit_score = fit_result["score"]
        timing_score = timing_result["score"]
        composite = (
            fit_score * config["fit_weight"] + timing_score * config["timing_weight"]
        )

        # Determine status from thresholds
        thresholds = config["score_thresholds"]
        if composite >= thresholds.get("hot", 75):
            status = "hot"
        elif composite >= thresholds.get("warm", 50):
            status = "warm"
        else:
            status = "monitor"

        # Compute vacancy stats
        now = datetime.now(UTC)
        oldest_days = (
            max((now - _vacancy_age_date(v)).days for v in vacancies)
            if vacancies
            else 0
        )
        platforms = len({v.source for v in vacancies})

        breakdown = {
            "fit": fit_result,
            "timing": timing_result,
            "fit_weight": config["fit_weight"],
            "timing_weight": config["timing_weight"],
        }

        # Upsert lead record
        result = await self.db.execute(
            select(Lead).where(
                Lead.company_id == company_id,
                Lead.search_profile_id == profile_id,
            )
        )
        lead = result.scalar_one_or_none()

        if lead:
            lead.fit_score = fit_score
            lead.timing_score = timing_score
            lead.composite_score = round(composite, 1)
            lead.scoring_breakdown = breakdown
            lead.vacancy_count = len(vacancies)
            lead.oldest_vacancy_days = oldest_days
            lead.platform_count = platforms
            lead.scored_at = now
            # Preserve dismissed status -- sales explicitly dismissed this lead
            if lead.status != "dismissed":
                lead.status = status
        else:
            lead = Lead(
                company_id=company_id,
                search_profile_id=profile_id,
                fit_score=fit_score,
                timing_score=timing_score,
                composite_score=round(composite, 1),
                status=status,
                scoring_breakdown=breakdown,
                vacancy_count=len(vacancies),
                oldest_vacancy_days=oldest_days,
                platform_count=platforms,
                scored_at=now,
            )
            self.db.add(lead)

        return lead

    def _compute_fit_score(
        self,
        company: Company,
        vacancies: list[Vacancy],
        criteria: dict,
    ) -> dict:
        """Compute fit score (0-100) from company data + vacancy extraction."""
        breakdown: dict = {}
        total_score = 0.0
        total_weight = 0.0

        # Aggregate extracted data from all vacancies
        extracted = self._aggregate_extracted_data(vacancies)

        # Employee count scoring
        if "employee_count" in criteria:
            criterion = criteria["employee_count"]
            weight = criterion["weight"]
            employee_range = company.employee_range or "unknown"
            score = criterion.get("thresholds", {}).get(employee_range, 30)
            breakdown["employee_count"] = {
                "score": score,
                "value": employee_range,
                "weight": weight,
            }
            total_score += score * weight
            total_weight += weight

        # Entity count scoring
        if "entity_count" in criteria:
            criterion = criteria["entity_count"]
            weight = criterion["weight"]
            entity_count = company.entity_count or 1
            score = 20  # default for single entity
            for threshold in criterion.get("thresholds", []):
                if threshold["min"] <= entity_count <= threshold["max"]:
                    score = threshold["score"]
                    break
            breakdown["entity_count"] = {
                "score": score,
                "value": entity_count,
                "weight": weight,
            }
            total_score += score * weight
            total_weight += weight

        # ERP compatibility scoring
        if "erp_compatibility" in criteria:
            criterion = criteria["erp_compatibility"]
            weight = criterion["weight"]
            erp_systems = extracted.get("erp_systems") or []
            best_score = 0
            best_erp = "unknown"
            for erp in erp_systems:
                erp_lower = erp.lower()
                for key, erp_score in criterion.get("scores", {}).items():
                    if key in erp_lower and erp_score > best_score:
                        best_score = erp_score
                        best_erp = erp
            if not erp_systems:
                best_score = 40  # unknown = moderate score
            breakdown["erp_compatibility"] = {
                "score": best_score,
                "value": best_erp,
                "weight": weight,
            }
            total_score += best_score * weight
            total_weight += weight

        # No existing automation scoring
        if "no_existing_automation" in criteria:
            criterion = criteria["no_existing_automation"]
            weight = criterion["weight"]
            raw_automation = extracted.get("automation_status") or "unknown"
            automation = (
                " ".join(str(x) for x in raw_automation)
                if isinstance(raw_automation, list)
                else str(raw_automation)
            )
            automation_keywords = ["basware", "coupa", "tradeshift", "rpa"]
            no_automation_keywords = ["geen", "no", "manual"]

            if any(kw in automation.lower() for kw in automation_keywords):
                score = criterion["scores"]["has_tool"]
                status_val = "has_tool"
            elif any(kw in automation.lower() for kw in no_automation_keywords):
                score = criterion["scores"]["confirmed_none"]
                status_val = "confirmed_none"
            else:
                score = criterion["scores"]["unknown"]
                status_val = "unknown"

            breakdown["no_existing_automation"] = {
                "score": score,
                "value": status_val,
                "weight": weight,
            }
            total_score += score * weight
            total_weight += weight

        # Revenue scoring
        if "revenue" in criteria:
            criterion = criteria["revenue"]
            weight = criterion["weight"]
            revenue_range = company.revenue_range or "unknown"
            score = criterion.get("thresholds", {}).get(revenue_range, 30)
            breakdown["revenue"] = {
                "score": score,
                "value": revenue_range,
                "weight": weight,
            }
            total_score += score * weight
            total_weight += weight

        # Sector fit scoring
        if "sector_fit" in criteria:
            criterion = criteria["sector_fit"]
            weight = criterion["weight"]
            sbi_codes = company.sbi_codes or []
            preferred = criterion.get("preferred_sbi_prefixes", [])
            score = 30  # default for non-matching sector
            matched_sbi = None
            for sbi in sbi_codes:
                sbi_str = str(sbi)
                for prefix in preferred:
                    if sbi_str.startswith(prefix):
                        score = 80
                        matched_sbi = sbi_str
                        break
                if matched_sbi:
                    break
            breakdown["sector_fit"] = {
                "score": score,
                "value": matched_sbi or "none",
                "weight": weight,
            }
            total_score += score * weight
            total_weight += weight

        # Multi-language scoring
        if "multi_language" in criteria:
            criterion = criteria["multi_language"]
            weight = criterion["weight"]
            raw_complexity = extracted.get("complexity_signals") or ""
            complexity = (
                " ".join(str(x) for x in raw_complexity)
                if isinstance(raw_complexity, list)
                else str(raw_complexity)
            )
            language_keywords = [
                "international",
                "multi",
                "language",
                "english",
                "german",
                "french",
            ]
            is_multi = any(kw in complexity.lower() for kw in language_keywords)
            score = (
                criterion["scores"]["multi"]
                if is_multi
                else criterion["scores"]["single"]
            )
            breakdown["multi_language"] = {
                "score": score,
                "value": "multi" if is_multi else "single",
                "weight": weight,
            }
            total_score += score * weight
            total_weight += weight

        # Normalize to 0-100
        final = (total_score / total_weight) if total_weight > 0 else 0
        return {"score": round(min(final, 100), 1), "breakdown": breakdown}

    def _compute_timing_score(
        self,
        vacancies: list[Vacancy],
        signals: dict,
    ) -> dict:
        """Compute timing score (0-100) from vacancy signals."""
        breakdown: dict = {}
        points = 0
        max_points = sum(signals.values())

        now = datetime.now(UTC)

        # Signal: vacancy open for more than 60 days
        # Uses published_at (actual publication date) when available,
        # falls back to first_seen_at.
        oldest_days = (
            max((now - _vacancy_age_date(v)).days for v in vacancies)
            if vacancies
            else 0
        )
        if oldest_days > 60:
            pts = signals.get("vacancy_age_over_60_days", 3)
            points += pts
            breakdown["vacancy_age_over_60_days"] = {
                "points": pts,
                "value": f"{oldest_days} days",
            }
        else:
            breakdown["vacancy_age_over_60_days"] = {
                "points": 0,
                "value": f"{oldest_days} days",
            }

        # Signal: multiple vacancies for the same role
        if len(vacancies) >= 2:
            pts = signals.get("multiple_vacancies_same_role", 4)
            points += pts
            breakdown["multiple_vacancies_same_role"] = {
                "points": pts,
                "value": len(vacancies),
            }
        else:
            breakdown["multiple_vacancies_same_role"] = {
                "points": 0,
                "value": len(vacancies),
            }

        # Signal: vacancy re-posted (seen over >14 day span)
        repeated = any(
            v.last_seen_at
            and v.first_seen_at
            and (v.last_seen_at - v.first_seen_at).days > 14
            for v in vacancies
        )
        if repeated:
            pts = signals.get("repeated_publication", 3)
            points += pts
            breakdown["repeated_publication"] = {"points": pts, "value": True}
        else:
            breakdown["repeated_publication"] = {"points": 0, "value": False}

        # Signal: posting on multiple platforms (desperation signal)
        platform_set = {v.source for v in vacancies}
        if len(platform_set) >= 2:
            pts = signals.get("multi_platform", 2)
            points += pts
            breakdown["multi_platform"] = {
                "points": pts,
                "value": sorted(platform_set),
            }
        else:
            breakdown["multi_platform"] = {
                "points": 0,
                "value": sorted(platform_set),
            }

        # Signal: management vacancy (hiring for senior/lead = bigger need)
        mgmt_keywords = [
            "manager",
            "teamleider",
            "hoofd",
            "director",
            "lead",
            "senior",
        ]
        has_mgmt = any(
            any(kw in v.job_title.lower() for kw in mgmt_keywords) for v in vacancies
        )
        if has_mgmt:
            pts = signals.get("management_vacancy", 2)
            points += pts
            breakdown["management_vacancy"] = {"points": pts, "value": True}
        else:
            breakdown["management_vacancy"] = {"points": 0, "value": False}

        # Normalize to 0-100
        score = (points / max_points * 100) if max_points > 0 else 0
        return {
            "score": round(min(score, 100), 1),
            "total_points": points,
            "max_points": max_points,
            "breakdown": breakdown,
        }

    @staticmethod
    def _aggregate_extracted_data(vacancies: list[Vacancy]) -> dict:
        """Merge extracted_data from all vacancies into a single dict.

        For list fields, deduplicates across vacancies. For string fields,
        keeps the longest (most detailed) value.
        """
        merged: dict = {}
        for vacancy in vacancies:
            if not vacancy.extracted_data:
                continue
            for key, value in vacancy.extracted_data.items():
                if value is None:
                    if key not in merged:
                        merged[key] = value
                    continue
                if key not in merged:
                    merged[key] = value
                elif isinstance(value, list):
                    existing = (
                        merged[key] if isinstance(merged[key], list) else [merged[key]]
                    )
                    merged[key] = list(set(existing + value))
                elif (
                    isinstance(value, str)
                    and value
                    and (not merged[key] or len(value) > len(str(merged[key])))
                ):
                    merged[key] = value
        return merged

    @staticmethod
    def _check_minimum_filters(company: Company, filters: dict) -> str | None:
        """Check if a company meets minimum size requirements.

        Returns a reason string if excluded, None if the company qualifies.
        Only filters when the company has been enriched (has data to check).
        """
        # Employee count filter
        emp_filter = filters.get("employee_count", {})
        if emp_filter.get("enabled") and company.employee_range:
            range_order = emp_filter.get("range_order", [])
            min_range = emp_filter.get("min_range", "1-9")
            if min_range in range_order and company.employee_range in range_order:
                min_idx = range_order.index(min_range)
                company_idx = range_order.index(company.employee_range)
                if company_idx < min_idx:
                    return (
                        f"Company too small: {company.employee_range} employees "
                        f"(minimum: {min_range})"
                    )

        # Revenue filter
        rev_filter = filters.get("revenue", {})
        if rev_filter.get("enabled") and company.revenue_range:
            range_order = rev_filter.get("range_order", [])
            min_range = rev_filter.get("min_range", "<1M")
            if min_range in range_order and company.revenue_range in range_order:
                min_idx = range_order.index(min_range)
                company_idx = range_order.index(company.revenue_range)
                if company_idx < min_idx:
                    return (
                        f"Revenue too low: {company.revenue_range} "
                        f"(minimum: {min_range})"
                    )

        return None

    @staticmethod
    def _check_excluded_company_types(company: Company, exclusions: dict) -> str | None:
        """Check if a company is a staffing agency or recruiter.

        Returns a reason string if excluded, None if the company qualifies.
        Checks SBI codes and company name patterns.
        """
        if not exclusions.get("enabled", False):
            return None

        # Check SBI codes (e.g. 78xx = staffing/uitzend/detachering)
        excluded_sbi = exclusions.get("excluded_sbi_prefixes", [])
        if excluded_sbi and company.sbi_codes:
            for sbi in company.sbi_codes:
                sbi_str = str(sbi)
                for prefix in excluded_sbi:
                    if sbi_str.startswith(prefix):
                        return (
                            f"Excluded company type: SBI {sbi_str} "
                            f"(staffing/uitzend/detachering)"
                        )

        # Check company name for staffing/recruitment keywords
        name_keywords = exclusions.get("excluded_name_keywords", [])
        if name_keywords and company.normalized_name:
            name_lower = company.normalized_name.lower()
            for keyword in name_keywords:
                if keyword.lower() in name_lower:
                    return (
                        f"Excluded company type: name contains "
                        f"'{keyword}' (staffing/recruitment)"
                    )

        return None

    async def _mark_excluded(
        self, company_id: int, profile_id: int, reason: str
    ) -> Lead:
        """Mark a lead as excluded (below minimum company size)."""
        result = await self.db.execute(
            select(Lead).where(
                Lead.company_id == company_id,
                Lead.search_profile_id == profile_id,
            )
        )
        lead = result.scalar_one_or_none()

        now = datetime.now(UTC)
        if lead:
            lead.status = "excluded"
            lead.scoring_breakdown = {"excluded_reason": reason}
            lead.scored_at = now
        else:
            lead = Lead(
                company_id=company_id,
                search_profile_id=profile_id,
                fit_score=0,
                timing_score=0,
                composite_score=0,
                status="excluded",
                scoring_breakdown={"excluded_reason": reason},
                vacancy_count=0,
                oldest_vacancy_days=0,
                platform_count=0,
                scored_at=now,
            )
            self.db.add(lead)

        return lead
