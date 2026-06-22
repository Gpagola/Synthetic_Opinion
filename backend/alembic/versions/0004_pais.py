"""país: columna pais (ISO-2) en persona, focus_group y survey

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-22

Añade el país como concepto de primer nivel para soporte multi-país
(España / Chile). Backfill: todas las filas existentes son de España (ES).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("persona", "focus_group", "survey"):
        # server_default="ES" garantiza el valor para las filas existentes (backfill)
        op.add_column(
            table,
            sa.Column("pais", sa.String(length=2), nullable=False, server_default="ES"),
        )
    # Backfill explícito por si quedara algún NULL previo.
    op.execute("UPDATE persona SET pais = 'ES' WHERE pais IS NULL OR pais = ''")
    op.execute("UPDATE focus_group SET pais = 'ES' WHERE pais IS NULL OR pais = ''")
    op.execute("UPDATE survey SET pais = 'ES' WHERE pais IS NULL OR pais = ''")


def downgrade() -> None:
    for table in ("survey", "focus_group", "persona"):
        op.drop_column(table, "pais")
