"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "persona",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("idioma", sa.String(length=10), nullable=False),
        sa.Column("origen", sa.String(length=20), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("sociodemografico", sa.JSON(), nullable=True),
        sa.Column("consumidor", sa.JSON(), nullable=True),
        sa.Column("opinion", sa.JSON(), nullable=True),
        sa.Column("bio", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "focus_group",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("tema", sa.String(length=500), nullable=True),
        sa.Column("idioma", sa.String(length=10), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "focus_group_member",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("focus_group_id", sa.Integer(), nullable=False),
        sa.Column("persona_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["focus_group_id"], ["focus_group.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["persona_id"], ["persona.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("focus_group_id", "persona_id", name="uq_fg_persona"),
    )

    op.create_table(
        "question",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("focus_group_id", sa.Integer(), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("persona_objetivo_id", sa.Integer(), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["focus_group_id"], ["focus_group.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["persona_objetivo_id"], ["persona.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "response",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("persona_id", sa.Integer(), nullable=False),
        sa.Column("persona_nombre", sa.String(length=255), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["question_id"], ["question.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["persona_id"], ["persona.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "report",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("focus_group_id", sa.Integer(), nullable=False),
        sa.Column("contenido_markdown", sa.Text(), nullable=False),
        sa.Column("metadatos", sa.JSON(), nullable=True),
        sa.Column("generated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["focus_group_id"], ["focus_group.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("report")
    op.drop_table("response")
    op.drop_table("question")
    op.drop_table("focus_group_member")
    op.drop_table("focus_group")
    op.drop_table("persona")
