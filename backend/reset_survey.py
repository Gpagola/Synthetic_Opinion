"""Resetea una encuesta a 'draft' para poder relanzarla.
Uso:  python reset_survey.py <survey_id>
"""
import sys
from app.database import SessionLocal
from app.models.survey import Survey

sid = int(sys.argv[1]) if len(sys.argv) > 1 else None
if not sid:
    sys.exit("Uso: python reset_survey.py <survey_id>")
db = SessionLocal()
s = db.get(Survey, sid)
if not s:
    sys.exit(f"Encuesta {sid} no encontrada.")
s.estado = "draft"
s.error_msg = None
db.commit()
db.close()
print(f"Encuesta {sid} ('{s.nombre}') reseteada a draft.")
