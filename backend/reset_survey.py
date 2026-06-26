"""Resetea una encuesta a 'draft' para poder relanzarla.
Uso:  python reset_survey.py <survey_id>
"""
import sys
from sqlalchemy import text
from app.database import SessionLocal

sid = int(sys.argv[1]) if len(sys.argv) > 1 else None
if not sid:
    sys.exit("Uso: python reset_survey.py <survey_id>")
db = SessionLocal()
row = db.execute(text("SELECT nombre FROM survey WHERE id=:id"), {"id": sid}).fetchone()
if not row:
    sys.exit(f"Encuesta {sid} no encontrada.")
db.execute(text("UPDATE survey SET estado='draft', error_msg=NULL WHERE id=:id"), {"id": sid})
db.commit()
db.close()
print(f"Encuesta {sid} ('{row[0]}') reseteada a draft.")
