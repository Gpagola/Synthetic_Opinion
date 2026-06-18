"""Migración de datos: separa país en pais_origen / pais_residencia.

Para cada persona, copia el valor actual de `pais` en `pais_origen` y
`pais_residencia` (si aún no existen). Conserva el `pais` antiguo por seguridad.

Uso:  python migrate_pais.py
"""

from app.database import SessionLocal
from app.models import Persona


def migrate():
    db = SessionLocal()
    try:
        actualizadas = 0
        for p in db.query(Persona).all():
            sd = dict(p.sociodemografico or {})
            pais = sd.get("pais")
            cambia = False
            if not sd.get("pais_origen"):
                sd["pais_origen"] = pais
                cambia = True
            if not sd.get("pais_residencia"):
                sd["pais_residencia"] = pais
                cambia = True
            if cambia:
                p.sociodemografico = sd  # reasignar para que SQLAlchemy detecte el cambio JSON
                actualizadas += 1
        db.commit()
        print(f"Personas actualizadas: {actualizadas}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
