"""Arranque rápido en local: crea las tablas directamente (sin Alembic).

Para producción usa migraciones: `alembic upgrade head`.

Uso:  python init_db.py
"""

from app.database import Base, engine
import app.models  # noqa: F401  (registra los modelos)


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Tablas creadas/verificadas en la base de datos.")
