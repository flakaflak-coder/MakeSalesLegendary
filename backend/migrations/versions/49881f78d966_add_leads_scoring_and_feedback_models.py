"""add leads scoring and feedback models

Revision ID: 49881f78d966
Revises: d63e5a581591
Create Date: 2026-02-19 18:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "49881f78d966"
down_revision: Union[str, Sequence[str], None] = "d63e5a581591"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- leads table ---
    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("search_profile_id", sa.Integer(), nullable=False),
        sa.Column("fit_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("timing_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("composite_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="monitor"),
        sa.Column(
            "scoring_breakdown",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("vacancy_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("oldest_vacancy_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("platform_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("scored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["company_id"], ["companies.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["search_profile_id"], ["search_profiles.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_lead_company_profile",
        "leads",
        ["company_id", "search_profile_id"],
        unique=True,
    )
    op.create_index("ix_lead_status", "leads", ["status"])
    op.create_index("ix_lead_composite_score", "leads", ["composite_score"])

    # --- scoring_configs table ---
    op.create_table(
        "scoring_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("fit_weight", sa.Float(), nullable=False, server_default="0.6"),
        sa.Column("timing_weight", sa.Float(), nullable=False, server_default="0.4"),
        sa.Column(
            "fit_criteria",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "timing_signals",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "score_thresholds",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='{"hot": 75, "warm": 50, "monitor": 25}',
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["profile_id"], ["search_profiles.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_scoring_config_profile_active",
        "scoring_configs",
        ["profile_id", "is_active"],
    )

    # --- feedback_logs table ---
    op.create_table(
        "feedback_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "scoring_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["lead_id"], ["leads.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("feedback_logs")
    op.drop_index("ix_scoring_config_profile_active", table_name="scoring_configs")
    op.drop_table("scoring_configs")
    op.drop_index("ix_lead_composite_score", table_name="leads")
    op.drop_index("ix_lead_status", table_name="leads")
    op.drop_index("ix_lead_company_profile", table_name="leads")
    op.drop_table("leads")
