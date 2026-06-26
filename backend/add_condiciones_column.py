"""Añade la columna `condiciones` a la tabla `survey_question`.

Uso:  python add_condiciones_column.py

Idempotente: si la columna ya existe, no hace nada (captura el error de MySQL).
"""
from __future__ import annotations

from sqlalchemy import text

from app.database import SessionLocal


def main() -> None:
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE survey_question "
            "ADD COLUMN condiciones JSON NULL DEFAULT (JSON_ARRAY())"
        ))
        db.commit()
        print("Columna `condiciones` añadida a survey_question.")
    except Exception as e:
        if "Duplicate column" in str(e) or "already exists" in str(e).lower():
            print("La columna `condiciones` ya existía — nada que hacer.")
        else:
            raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
