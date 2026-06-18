"""Normaliza en la BBDD los niveles de ingresos y de educación a un conjunto
canónico, agrupando variantes (mayúsculas, plurales, sinónimos).

Uso:  python normalize_levels.py
"""

from __future__ import annotations

import re

from app.database import SessionLocal
from app.models import Persona


def norm_ingreso(s: str | None) -> str | None:
    t = (s or "").lower()
    if not t.strip():
        return s
    if re.search(r"(medio|media).*(alto|alta)|(alto|alta).*(medio|media)", t):
        return "Medio-alto"
    if re.search(r"(medio|media).*(bajo|baja)|(bajo|baja).*(medio|media)", t):
        return "Medio-bajo"
    if re.search(r"medio|media", t):
        return "Medio"
    if re.search(r"bajo|baja", t):
        return "Bajo"
    if re.search(r"alto|alta", t):
        return "Alto"
    return s  # sin coincidencia: se deja como estaba


def norm_edu(s: str | None) -> str | None:
    t = (s or "").lower()
    if not t.strip():
        return s
    if re.search(r"m[aá]ster|posgrado|postgrado|doctor|phd|mba", t):
        return "Postgrado"
    if re.search(r"formaci[oó]n profesional|\bfp\b|grado medio|grado superior|ciclo formativo|t[eé]cnic", t):
        return "Formación Profesional"
    if re.search(r"universi|licenci|diplom|ingenier|\bgrado\b|educaci[oó]n superior", t):
        return "Universitario"
    if re.search(r"bachiller|\bbup\b|\bcou\b", t):
        return "Bachillerato"
    if re.search(r"secundaria|\beso\b|graduado escolar", t):
        return "Secundaria"
    if re.search(r"primaria|primarios|\begb\b", t):
        return "Primaria"
    if re.search(r"sin estudios|ninguno|analfabet|sin formaci", t):
        return "Sin estudios"
    return s


def main():
    db = SessionLocal()
    cambios = 0
    try:
        for p in db.query(Persona).all():
            sd = dict(p.sociodemografico or {})
            ni = norm_ingreso(sd.get("ingresos"))
            ne = norm_edu(sd.get("nivel_educativo"))
            cambia = False
            if ni != sd.get("ingresos"):
                sd["ingresos"] = ni
                cambia = True
            if ne != sd.get("nivel_educativo"):
                sd["nivel_educativo"] = ne
                cambia = True
            if cambia:
                p.sociodemografico = sd
                cambios += 1
        db.commit()
        print(f"Personas normalizadas: {cambios}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
