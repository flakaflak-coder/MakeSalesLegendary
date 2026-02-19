from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles

from app.models.company import Company
from app.models.lead import Lead, ScoringConfig
from app.models.profile import SearchProfile
from app.models.vacancy import Vacancy
from app.services.scoring import (
    DEFAULT_FIT_CRITERIA,
    DEFAULT_TIMING_SIGNALS,
    ScoringService,
)


# SQLite doesn't support JSONB — compile it as JSON for tests
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_profile(db_session) -> SearchProfile:
    profile = SearchProfile(name="Accounts Payable", slug="ap")
    db_session.add(profile)
    await db_session.flush()
    return profile


async def _create_company(
    db_session,
    name: str = "Acme B.V.",
    employee_range: str | None = "200-499",
    entity_count: int | None = 5,
    revenue_range: str | None = "10M-50M",
    sbi_codes: list | None = None,
) -> Company:
    company = Company(
        name=name,
        normalized_name=name.lower().replace(" ", ""),
        employee_range=employee_range,
        entity_count=entity_count,
        revenue_range=revenue_range,
        sbi_codes=sbi_codes or ["6201"],
    )
    db_session.add(company)
    await db_session.flush()
    return company


async def _create_vacancy(
    db_session,
    profile_id: int,
    company_id: int,
    *,
    job_title: str = "AP Medewerker",
    source: str = "google_jobs",
    first_seen_at: datetime | None = None,
    last_seen_at: datetime | None = None,
    extracted_data: dict | None = None,
    status: str = "active",
) -> Vacancy:
    now = datetime.now(UTC)
    vacancy = Vacancy(
        external_id=f"v-{company_id}-{source}-{job_title.replace(' ', '-')}",
        source=source,
        search_profile_id=profile_id,
        company_id=company_id,
        company_name_raw="Acme B.V.",
        job_title=job_title,
        raw_text="Vacancy text placeholder",
        first_seen_at=first_seen_at or now,
        last_seen_at=last_seen_at or now,
        extracted_data=extracted_data,
        status=status,
    )
    db_session.add(vacancy)
    await db_session.flush()
    return vacancy


# ---------------------------------------------------------------------------
# Fit score tests
# ---------------------------------------------------------------------------


class TestComputeFitScore:
    """Tests for the fit scoring logic."""

    def test_employee_count_scoring(self, db_session):
        """Large companies score higher on employee_count."""
        service = ScoringService(db=db_session)
        company = Company(
            id=1,
            name="Big Corp",
            normalized_name="bigcorp",
            employee_range="200-499",
        )
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Big Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data=None,
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["employee_count"]["score"] == 80
        assert result["breakdown"]["employee_count"]["value"] == "200-499"

    def test_entity_count_scoring(self, db_session):
        """Companies with multiple entities score higher."""
        service = ScoringService(db=db_session)
        company = Company(
            id=1,
            name="Multi Entity Corp",
            normalized_name="multientitycorp",
            entity_count=5,
        )
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Multi Entity Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data=None,
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["entity_count"]["score"] == 50
        assert result["breakdown"]["entity_count"]["value"] == 5

    def test_erp_compatibility_from_extracted_data(self, db_session):
        """ERP systems extracted from vacancies affect fit score."""
        service = ScoringService(db=db_session)
        company = Company(id=1, name="SAP Corp", normalized_name="sapcorp")
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="SAP Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"erp_systems": ["SAP S/4HANA"]},
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["erp_compatibility"]["score"] == 90
        assert result["breakdown"]["erp_compatibility"]["value"] == "SAP S/4HANA"

    def test_erp_unknown_gets_moderate_score(self, db_session):
        """No ERP data should yield a moderate score, not zero."""
        service = ScoringService(db=db_session)
        company = Company(id=1, name="Unknown ERP", normalized_name="unknownerp")
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Unknown ERP",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={},
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["erp_compatibility"]["score"] == 40

    def test_no_existing_automation_confirmed_none(self, db_session):
        """Companies with no existing automation score high on that criterion."""
        service = ScoringService(db=db_session)
        company = Company(id=1, name="Manual Corp", normalized_name="manualcorp")
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Manual Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"automation_status": "No automation, manual process"},
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["no_existing_automation"]["score"] == 90
        automation = result["breakdown"]["no_existing_automation"]
        assert automation["value"] == "confirmed_none"

    def test_has_existing_automation_low_score(self, db_session):
        """Companies with existing P2P tools score low (not a good lead)."""
        service = ScoringService(db=db_session)
        company = Company(id=1, name="Automated Corp", normalized_name="automatedcorp")
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Automated Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"automation_status": "Using Basware for P2P"},
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["no_existing_automation"]["score"] == 10
        assert result["breakdown"]["no_existing_automation"]["value"] == "has_tool"

    def test_sector_fit_matching_sbi(self, db_session):
        """Companies in preferred sectors score higher."""
        service = ScoringService(db=db_session)
        company = Company(
            id=1,
            name="IT Corp",
            normalized_name="itcorp",
            sbi_codes=["6201"],
        )
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="IT Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data=None,
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["sector_fit"]["score"] == 80
        assert result["breakdown"]["sector_fit"]["value"] == "6201"

    def test_multi_language_from_extraction(self, db_session):
        """International complexity signals boost multi_language criterion."""
        service = ScoringService(db=db_session)
        company = Company(id=1, name="Global Corp", normalized_name="globalcorp")
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Global Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={
                    "complexity_signals": "International operations, English and German"
                },
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert result["breakdown"]["multi_language"]["score"] == 80
        assert result["breakdown"]["multi_language"]["value"] == "multi"

    def test_fit_score_in_valid_range(self, db_session):
        """Fit score must be between 0 and 100."""
        service = ScoringService(db=db_session)
        company = Company(
            id=1,
            name="Max Corp",
            normalized_name="maxcorp",
            employee_range="1000+",
            entity_count=25,
            revenue_range="500M+",
            sbi_codes=["6201"],
        )
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Max Corp",
                job_title="AP Medewerker",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={
                    "erp_systems": ["SAP"],
                    "automation_status": "No automation",
                    "complexity_signals": "International multi-language",
                },
            )
        ]
        result = service._compute_fit_score(company, vacancies, DEFAULT_FIT_CRITERIA)
        assert 0 <= result["score"] <= 100


# ---------------------------------------------------------------------------
# Timing score tests
# ---------------------------------------------------------------------------


class TestComputeTimingScore:
    """Tests for the timing scoring logic."""

    def test_old_vacancy_scores_points(self, db_session):
        """Vacancy open for >60 days earns timing points."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now - timedelta(days=90),
                last_seen_at=now,
                status="active",
            )
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["breakdown"]["vacancy_age_over_60_days"]["points"] == 3
        assert "90 days" in result["breakdown"]["vacancy_age_over_60_days"]["value"]

    def test_recent_vacancy_no_age_points(self, db_session):
        """Vacancy open for <60 days gets zero age points."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now - timedelta(days=30),
                last_seen_at=now,
                status="active",
            )
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["breakdown"]["vacancy_age_over_60_days"]["points"] == 0

    def test_multiple_vacancies_scores_points(self, db_session):
        """Two or more vacancies for same role earn points."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=i,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now,
                last_seen_at=now,
                status="active",
            )
            for i in range(1, 4)
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["breakdown"]["multiple_vacancies_same_role"]["points"] == 4
        assert result["breakdown"]["multiple_vacancies_same_role"]["value"] == 3

    def test_multi_platform_scores_points(self, db_session):
        """Posting on multiple platforms earns timing points."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now,
                last_seen_at=now,
                status="active",
            ),
            Vacancy(
                id=2,
                source="indeed",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now,
                last_seen_at=now,
                status="active",
            ),
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["breakdown"]["multi_platform"]["points"] == 2

    def test_management_vacancy_scores_points(self, db_session):
        """Management-level job titles earn timing points."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="Manager Accounts Payable",
                first_seen_at=now,
                last_seen_at=now,
                status="active",
            )
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["breakdown"]["management_vacancy"]["points"] == 2

    def test_repeated_publication_scores_points(self, db_session):
        """Vacancy seen over >14 day span earns repeated publication points."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now - timedelta(days=20),
                last_seen_at=now,
                status="active",
            )
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["breakdown"]["repeated_publication"]["points"] == 3

    def test_max_timing_score_all_signals(self, db_session):
        """All timing signals present should yield 100."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="Manager Accounts Payable",
                first_seen_at=now - timedelta(days=90),
                last_seen_at=now,
                status="active",
            ),
            Vacancy(
                id=2,
                source="indeed",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="Senior AP Medewerker",
                first_seen_at=now - timedelta(days=90),
                last_seen_at=now,
                status="active",
            ),
            Vacancy(
                id=3,
                source="linkedin",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now - timedelta(days=90),
                last_seen_at=now,
                status="active",
            ),
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert result["score"] == 100.0
        assert result["total_points"] == result["max_points"]

    def test_timing_score_in_valid_range(self, db_session):
        """Timing score must be between 0 and 100."""
        service = ScoringService(db=db_session)
        now = datetime.now(UTC)
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP Medewerker",
                first_seen_at=now,
                last_seen_at=now,
                status="active",
            )
        ]
        result = service._compute_timing_score(vacancies, DEFAULT_TIMING_SIGNALS)
        assert 0 <= result["score"] <= 100


# ---------------------------------------------------------------------------
# Composite scoring + status classification
# ---------------------------------------------------------------------------


class TestCompositeScoring:
    """Tests for composite score calculation and status classification."""

    @pytest.mark.asyncio
    async def test_composite_score_and_hot_status(self, db_session):
        """High-scoring company should be classified as 'hot'."""
        profile = await _create_profile(db_session)
        company = await _create_company(
            db_session,
            employee_range="1000+",
            entity_count=25,
            revenue_range="500M+",
            sbi_codes=["6201"],
        )
        now = datetime.now(UTC)
        # Create signals that push both fit and timing high
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            job_title="Manager Accounts Payable",
            source="google_jobs",
            first_seen_at=now - timedelta(days=90),
            last_seen_at=now,
            extracted_data={
                "erp_systems": ["SAP"],
                "automation_status": "No automation, manual process",
                "complexity_signals": "International multi-language operations",
            },
        )
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            job_title="Senior AP Medewerker",
            source="indeed",
            first_seen_at=now - timedelta(days=90),
            last_seen_at=now,
            extracted_data={"erp_systems": ["SAP"]},
        )
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            job_title="AP Medewerker",
            source="linkedin",
            first_seen_at=now - timedelta(days=90),
            last_seen_at=now,
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        stats = await service.score_profile(profile.id)

        assert stats["scored"] == 1
        assert stats["hot"] == 1

    @pytest.mark.asyncio
    async def test_low_scoring_company_is_monitor(self, db_session):
        """Low-scoring company should be classified as 'monitor'."""
        profile = await _create_profile(db_session)
        company = await _create_company(
            db_session,
            employee_range="1-9",
            entity_count=1,
            revenue_range="<1M",
            sbi_codes=["0111"],  # non-matching sector
        )
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            first_seen_at=now - timedelta(days=5),
            extracted_data={"automation_status": "Using Basware for P2P"},
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        stats = await service.score_profile(profile.id)

        assert stats["scored"] == 1
        assert stats["monitor"] == 1

    @pytest.mark.asyncio
    async def test_composite_is_weighted_average(self, db_session):
        """Composite = fit * fit_weight + timing * timing_weight."""
        profile = await _create_profile(db_session)
        company = await _create_company(db_session)
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            first_seen_at=now - timedelta(days=5),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        await service.score_profile(profile.id)

        from sqlalchemy import select

        result = await db_session.execute(
            select(Lead).where(
                Lead.company_id == company.id,
                Lead.search_profile_id == profile.id,
            )
        )
        lead = result.scalar_one()

        expected_composite = round(lead.fit_score * 0.6 + lead.timing_score * 0.4, 1)
        assert lead.composite_score == expected_composite


# ---------------------------------------------------------------------------
# Upsert and status preservation
# ---------------------------------------------------------------------------


class TestLeadUpsert:
    """Tests for lead create/update behavior."""

    @pytest.mark.asyncio
    async def test_rescoring_updates_existing_lead(self, db_session):
        """Scoring the same company twice should update, not duplicate."""
        profile = await _create_profile(db_session)
        company = await _create_company(db_session)
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            first_seen_at=now - timedelta(days=5),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        await service.score_profile(profile.id)
        await service.score_profile(profile.id)

        from sqlalchemy import func, select

        result = await db_session.execute(
            select(func.count())
            .select_from(Lead)
            .where(
                Lead.company_id == company.id,
                Lead.search_profile_id == profile.id,
            )
        )
        count = result.scalar()
        assert count == 1

    @pytest.mark.asyncio
    async def test_dismissed_status_preserved(self, db_session):
        """Dismissed leads should keep their status after rescoring."""
        profile = await _create_profile(db_session)
        company = await _create_company(db_session)
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            first_seen_at=now - timedelta(days=5),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        await service.score_profile(profile.id)

        # Manually dismiss the lead
        from sqlalchemy import select

        result = await db_session.execute(
            select(Lead).where(
                Lead.company_id == company.id,
                Lead.search_profile_id == profile.id,
            )
        )
        lead = result.scalar_one()
        lead.status = "dismissed"
        await db_session.flush()

        # Re-score — status should remain dismissed
        await service.score_profile(profile.id)

        await db_session.refresh(lead)
        assert lead.status == "dismissed"
        # But scores should still be updated
        assert lead.scored_at is not None


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


class TestScoringConfig:
    """Tests for scoring config loading and defaults."""

    @pytest.mark.asyncio
    async def test_default_config_when_none_exists(self, db_session):
        """Without a ScoringConfig row, defaults should be used."""
        profile = await _create_profile(db_session)
        service = ScoringService(db=db_session)
        config = await service._get_scoring_config(profile.id)

        assert config["fit_weight"] == 0.6
        assert config["timing_weight"] == 0.4
        assert config["fit_criteria"] == DEFAULT_FIT_CRITERIA
        assert config["timing_signals"] == DEFAULT_TIMING_SIGNALS
        assert config["score_thresholds"] == {"hot": 75, "warm": 50, "monitor": 25}

    @pytest.mark.asyncio
    async def test_custom_config_loaded(self, db_session):
        """Active ScoringConfig row should override defaults."""
        profile = await _create_profile(db_session)

        custom_criteria = {
            "employee_count": {
                "weight": 1.0,
                "thresholds": {"200-499": 100},
            }
        }
        scoring_config = ScoringConfig(
            profile_id=profile.id,
            version=1,
            is_active=True,
            fit_weight=0.7,
            timing_weight=0.3,
            fit_criteria=custom_criteria,
            timing_signals=DEFAULT_TIMING_SIGNALS,
            score_thresholds={"hot": 80, "warm": 60, "monitor": 30},
        )
        db_session.add(scoring_config)
        await db_session.flush()

        service = ScoringService(db=db_session)
        config = await service._get_scoring_config(profile.id)

        assert config["fit_weight"] == 0.7
        assert config["timing_weight"] == 0.3
        assert config["fit_criteria"] == custom_criteria
        assert config["score_thresholds"]["hot"] == 80

    @pytest.mark.asyncio
    async def test_custom_thresholds_affect_status(self, db_session):
        """Custom score_thresholds should affect lead status classification."""
        profile = await _create_profile(db_session)

        # Set very low thresholds so everything is "hot"
        scoring_config = ScoringConfig(
            profile_id=profile.id,
            version=1,
            is_active=True,
            fit_weight=0.6,
            timing_weight=0.4,
            fit_criteria=DEFAULT_FIT_CRITERIA,
            timing_signals=DEFAULT_TIMING_SIGNALS,
            score_thresholds={"hot": 5, "warm": 2, "monitor": 0},
        )
        db_session.add(scoring_config)

        company = await _create_company(
            db_session,
            employee_range="1-9",
            entity_count=1,
            revenue_range="<1M",
            sbi_codes=["0111"],
        )
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            first_seen_at=now - timedelta(days=5),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        await service.score_profile(profile.id)

        from sqlalchemy import select

        result = await db_session.execute(
            select(Lead).where(
                Lead.company_id == company.id,
                Lead.search_profile_id == profile.id,
            )
        )
        lead = result.scalar_one()
        # With threshold of 5, even a low-scoring company should be "hot"
        assert lead.status == "hot"


# ---------------------------------------------------------------------------
# Extracted data aggregation
# ---------------------------------------------------------------------------


class TestAggregateExtractedData:
    """Tests for merging extracted data across multiple vacancies."""

    def test_merge_list_fields_deduplicates(self):
        """List fields from multiple vacancies should be merged and deduplicated."""
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"erp_systems": ["SAP", "Oracle"]},
            ),
            Vacancy(
                id=2,
                source="indeed",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"erp_systems": ["SAP", "AFAS"]},
            ),
        ]
        result = ScoringService._aggregate_extracted_data(vacancies)
        assert set(result["erp_systems"]) == {"SAP", "Oracle", "AFAS"}

    def test_merge_string_keeps_longest(self):
        """String fields should keep the longest (most detailed) value."""
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"automation_status": "manual"},
            ),
            Vacancy(
                id=2,
                source="indeed",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={
                    "automation_status": (
                        "No automation, fully manual invoice processing"
                    ),
                },
            ),
        ]
        result = ScoringService._aggregate_extracted_data(vacancies)
        expected = "No automation, fully manual invoice processing"
        assert result["automation_status"] == expected

    def test_merge_skips_none_extracted_data(self):
        """Vacancies with no extracted_data should be skipped."""
        vacancies = [
            Vacancy(
                id=1,
                source="google_jobs",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data=None,
            ),
            Vacancy(
                id=2,
                source="indeed",
                search_profile_id=1,
                company_id=1,
                company_name_raw="Acme",
                job_title="AP",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                status="active",
                extracted_data={"erp_systems": ["SAP"]},
            ),
        ]
        result = ScoringService._aggregate_extracted_data(vacancies)
        assert result["erp_systems"] == ["SAP"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_no_active_vacancies_returns_empty_stats(self, db_session):
        """Profile with no active vacancies should score zero companies."""
        profile = await _create_profile(db_session)
        service = ScoringService(db=db_session)
        stats = await service.score_profile(profile.id)

        assert stats == {"scored": 0, "hot": 0, "warm": 0, "monitor": 0}

    @pytest.mark.asyncio
    async def test_inactive_vacancies_ignored(self, db_session):
        """Only active vacancies should be considered for scoring."""
        profile = await _create_profile(db_session)
        company = await _create_company(db_session)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            status="filled",
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        stats = await service.score_profile(profile.id)
        assert stats["scored"] == 0

    @pytest.mark.asyncio
    async def test_vacancy_stats_computed_correctly(self, db_session):
        """Lead should have correct vacancy stats."""
        profile = await _create_profile(db_session)
        company = await _create_company(db_session)
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            source="google_jobs",
            first_seen_at=now - timedelta(days=45),
        )
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            job_title="Senior AP Medewerker",
            source="indeed",
            first_seen_at=now - timedelta(days=10),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        await service.score_profile(profile.id)

        from sqlalchemy import select

        result = await db_session.execute(
            select(Lead).where(
                Lead.company_id == company.id,
                Lead.search_profile_id == profile.id,
            )
        )
        lead = result.scalar_one()
        assert lead.vacancy_count == 2
        assert lead.oldest_vacancy_days >= 45
        assert lead.platform_count == 2

    @pytest.mark.asyncio
    async def test_multiple_companies_scored_independently(self, db_session):
        """Multiple companies for the same profile get separate leads."""
        profile = await _create_profile(db_session)
        company_a = await _create_company(db_session, name="Company A")
        company_b = await _create_company(
            db_session,
            name="Company B",
            employee_range="1-9",
            entity_count=1,
        )
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company_a.id,
            first_seen_at=now - timedelta(days=5),
        )
        await _create_vacancy(
            db_session,
            profile.id,
            company_b.id,
            first_seen_at=now - timedelta(days=5),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        stats = await service.score_profile(profile.id)

        assert stats["scored"] == 2

        from sqlalchemy import func, select

        result = await db_session.execute(
            select(func.count())
            .select_from(Lead)
            .where(
                Lead.search_profile_id == profile.id,
            )
        )
        count = result.scalar()
        assert count == 2

    @pytest.mark.asyncio
    async def test_scoring_breakdown_has_all_keys(self, db_session):
        """Scoring breakdown should contain both fit and timing details."""
        profile = await _create_profile(db_session)
        company = await _create_company(db_session)
        now = datetime.now(UTC)
        await _create_vacancy(
            db_session,
            profile.id,
            company.id,
            first_seen_at=now - timedelta(days=5),
        )
        await db_session.flush()

        service = ScoringService(db=db_session)
        await service.score_profile(profile.id)

        from sqlalchemy import select

        result = await db_session.execute(
            select(Lead).where(
                Lead.company_id == company.id,
                Lead.search_profile_id == profile.id,
            )
        )
        lead = result.scalar_one()
        breakdown = lead.scoring_breakdown

        assert "fit" in breakdown
        assert "timing" in breakdown
        assert "fit_weight" in breakdown
        assert "timing_weight" in breakdown
        assert "breakdown" in breakdown["fit"]
        assert "breakdown" in breakdown["timing"]
        assert breakdown["fit_weight"] == 0.6
        assert breakdown["timing_weight"] == 0.4
