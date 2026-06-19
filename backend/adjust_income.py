"""Reasigna SOLO el nivel de ingresos para que las proporciones coincidan con
los deciles de renta del INE, manteniendo la correlación con educación/región/edad.

Mapeo (deciles INE):
  Alto (decil 10) ~10% · Medio-alto (8-9) ~20% · Medio (5-7) ~30%
  Medio-bajo (3-4) ~20% · Bajo (1-2) ~20% · Otros → 0 (todos clasificados)

Método: se calcula un score socioeconómico por persona (educación + región + edad
+ ruido), se ordena toda la población y se cortan los tramos por cuantiles. No se
toca ninguna otra variable.

Uso:  python adjust_income.py
"""

from __future__ import annotations

import random
import re

from app.database import SessionLocal
from app.models import Persona

random.seed(2026)

# Tramos en orden de mayor a menor renta y su proporción objetivo
TIERS = [("Alto", 0.10), ("Medio-alto", 0.20), ("Medio", 0.30),
         ("Medio-bajo", 0.20), ("Bajo", 0.20)]

REG_HIGH = {"Comunidad de Madrid", "País Vasco", "Navarra", "Cataluña", "Cantabria", "Aragón"}
REG_LOW = {"Extremadura", "Castilla-La Mancha", "Andalucía", "Región de Murcia",
           "Canarias", "Islas Baleares", "Comunidad Valenciana"}


def _edu_rank(s: str | None) -> float:
    t = (s or "").lower()
    if re.search(r"m[aá]ster|posgrado|postgrado|doctor", t):
        return 6.0
    if re.search(r"universi|licenci|diplom", t):  # antes que FP (la etiqueta uni contiene 'FP superior')
        return 5.0
    if re.search(r"formaci[oó]n profesional|\bfp\b|grado medio|ciclo", t):
        return 3.5
    if re.search(r"bachiller", t):
        return 3.0
    if re.search(r"secundaria|\beso\b", t):
        return 2.0
    if re.search(r"primaria", t):
        return 1.0
    if re.search(r"sin estudios|analfabet|ninguno", t):
        return 0.0
    return 2.5  # desconocido → medio-bajo


def _score(p: Persona) -> float:
    sd = p.sociodemografico or {}
    s = _edu_rank(sd.get("nivel_educativo")) * 1.0
    region = sd.get("region")
    if region in REG_HIGH:
        s += 0.6
    elif region in REG_LOW:
        s -= 0.6
    edad = sd.get("edad")
    if edad is not None:
        if 35 <= edad <= 64:
            s += 0.3
        elif 25 <= edad <= 34:
            s += 0.1
        elif edad < 25:
            s -= 0.3
        else:  # 65+
            s -= 0.2
    s += random.gauss(0, 1.2)  # dispersión: la educación no determina al 100%
    return s


def main():
    db = SessionLocal()
    try:
        personas = db.query(Persona).filter(Persona.activo.is_(True)).all()
        ranked = sorted(personas, key=_score, reverse=True)
        n = len(ranked)
        # límites acumulados por tramo
        cuts = []
        acc = 0
        for label, prop in TIERS[:-1]:
            acc += round(prop * n)
            cuts.append((label, acc))
        cambios = 0
        idx = 0
        bounds = [0] + [c for _, c in cuts] + [n]
        labels = [t[0] for t in TIERS]
        for i, label in enumerate(labels):
            for p in ranked[bounds[i]:bounds[i + 1]]:
                sd = dict(p.sociodemografico or {})
                if sd.get("ingresos") != label:
                    sd["ingresos"] = label
                    p.sociodemografico = sd
                    cambios += 1
        db.commit()
        print(f"Ingresos reasignados: {cambios} de {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
