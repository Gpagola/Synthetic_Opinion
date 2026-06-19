"""Reasigna el nivel educativo de la población siguiendo la tabla del INE
(% estimado 25-64) y conjugando EDAD (cohorte), GÉNERO, CLASE (ingresos) y
COMUNIDAD. Usa los nombres de categoría detallados (CINE).

Referencia 25-64 (INE):
  Sin estudios ~3 · Primaria ~10 · Secundaria(ESO) ~23 · Bachillerato ~12
  FP grado medio ~11 · Universitario ~35 · Postgrado ~6

Uso:  python adjust_education.py
"""

from __future__ import annotations

import random

from app.database import SessionLocal
from app.models import Persona

random.seed(2025)

LEVELS = [
    "Sin estudios",
    "Primaria",
    "Secundaria (1ª etapa / ESO)",
    "Bachillerato",
    "Formación Profesional (grado medio)",
    "Universitario (grado/diplomatura/FP superior)",
    "Postgrado (máster/doctorado)",
]

BANDS = [("18-24", 18, 24), ("25-34", 25, 34), ("35-44", 35, 44), ("45-54", 45, 54),
         ("55-64", 55, 64), ("65-74", 65, 74), ("75-84", 75, 84), ("85+", 85, 200)]

# Vectores [Sin, Prim, Sec, Bach, FP, Univ, Posg]
TABLE_2564 = [0.03, 0.10, 0.23, 0.12, 0.11, 0.35, 0.06]  # tabla INE 25-64
BASE = {
    "18-24": [0.01, 0.03, 0.25, 0.30, 0.18, 0.22, 0.01],
    "25-34": TABLE_2564,
    "35-44": TABLE_2564,
    "45-54": TABLE_2564,
    "55-64": TABLE_2564,
    "65-74": [0.10, 0.34, 0.22, 0.09, 0.07, 0.15, 0.03],
    "75-84": [0.20, 0.42, 0.16, 0.07, 0.04, 0.09, 0.02],
    "85+":   [0.30, 0.44, 0.12, 0.05, 0.03, 0.05, 0.01],
}

REG_HIGH = {"Comunidad de Madrid", "País Vasco", "Navarra", "Cantabria",
            "Castilla y León", "Aragón"}
REG_LOW = {"Extremadura", "Castilla-La Mancha", "Andalucía", "Región de Murcia",
           "Canarias", "Islas Baleares", "Comunidad Valenciana"}


def _band(edad):
    if edad is None:
        return "35-44"
    for label, lo, hi in BANDS:
        if lo <= edad <= hi:
            return label
    return "35-44"


def _norm_gen(g):
    s = (g or "").lower()
    if s.startswith("muj") or s.startswith("fem"):
        return "Mujer"
    if s.startswith("hom") or s.startswith("masc") or s.startswith("var"):
        return "Hombre"
    return "Otro"


def _mult(v, m):
    return [a * b for a, b in zip(v, m)]


def _dist(edad, genero, ingresos, region):
    v = list(BASE[_band(edad)])
    # Clase social (ingresos) — ajuste suave para no alejarse de la tabla
    if ingresos in ("Alto", "Medio-alto"):
        v = _mult(v, [0.5, 0.5, 0.7, 0.95, 1.0, 1.5, 2.0])
    elif ingresos in ("Bajo", "Medio-bajo"):
        v = _mult(v, [1.4, 1.5, 1.2, 1.0, 1.0, 0.65, 0.5])
    # Región
    if region in REG_HIGH:
        v = _mult(v, [0.85, 0.9, 0.97, 1.0, 1.0, 1.18, 1.2])
    elif region in REG_LOW:
        v = _mult(v, [1.12, 1.12, 1.05, 1.0, 1.0, 0.85, 0.8])
    # Género por cohorte
    g = _norm_gen(genero)
    if edad is not None and edad <= 44:
        if g == "Mujer":
            v = _mult(v, [0.9, 0.9, 1.0, 1.0, 1.0, 1.12, 1.1])
        elif g == "Hombre":
            v = _mult(v, [1.0, 1.0, 1.0, 1.0, 1.1, 0.96, 0.95])
    elif edad is not None and edad >= 65:
        if g == "Mujer":
            v = _mult(v, [1.4, 1.2, 1.0, 1.0, 0.9, 0.7, 0.7])
        elif g == "Hombre":
            v = _mult(v, [0.9, 0.95, 1.0, 1.0, 1.05, 1.1, 1.05])
    s = sum(v) or 1.0
    return [x / s for x in v]


def main():
    db = SessionLocal()
    cambios = 0
    try:
        for p in db.query(Persona).all():
            sd = dict(p.sociodemografico or {})
            nivel = random.choices(
                LEVELS,
                weights=_dist(sd.get("edad"), sd.get("genero"),
                              sd.get("ingresos"), sd.get("region")),
                k=1,
            )[0]
            if sd.get("nivel_educativo") != nivel:
                sd["nivel_educativo"] = nivel
                p.sociodemografico = sd
                cambios += 1
        db.commit()
        print(f"Niveles educativos reajustados: {cambios} de {db.query(Persona).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
