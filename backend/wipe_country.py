"""Borra (hard-delete) TODAS las personas de un país de la base de datos.

Uso:  python wipe_country.py CL

Pensado para regenerar desde cero la población de un país (p.ej. tras recalibrar
educación/ingresos). El código de país es OBLIGATORIO: sin argumento aborta, para
no borrar nada por accidente. Solo afecta al país indicado; el resto se conserva.

Seguro a nivel de integridad: todas las FK que apuntan a `persona` están definidas
con ON DELETE CASCADE (respuestas de encuesta, miembros y respuestas de focus
group) o SET NULL (pregunta objetivo), y MySQL las aplica a nivel de motor.
"""

from __future__ import annotations

import sys

from app.database import SessionLocal
from app.models import Persona


def main() -> None:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        sys.exit("Uso: python wipe_country.py <CODIGO_PAIS>  (p.ej. CL)")
    code = sys.argv[1].strip().upper()

    db = SessionLocal()
    try:
        n = (
            db.query(Persona)
            .filter(Persona.pais == code)
            .delete(synchronize_session=False)
        )
        db.commit()
        print(f"Borradas {n} personas del país {code}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
