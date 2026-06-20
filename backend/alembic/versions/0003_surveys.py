"""encuestas: survey, survey_question, survey_response

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "survey",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("tema", sa.String(length=500), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("idioma", sa.String(length=10), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("modelo", sa.String(length=60), nullable=True),
        sa.Column("reasoning_effort", sa.String(length=20), nullable=True),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "survey_question",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("survey_id", sa.Integer(), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("opciones", sa.JSON(), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=True),
        sa.Column("obligatoria", sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(["survey_id"], ["survey.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "survey_response",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("survey_id", sa.Integer(), nullable=False),
        sa.Column("persona_id", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=True),
        sa.Column("respuestas", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["survey_id"], ["survey.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["persona_id"], ["persona.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("survey_response")
    op.drop_table("survey_question")
    op.drop_table("survey")
