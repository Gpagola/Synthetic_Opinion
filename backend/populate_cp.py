"""Asigna un código postal a cada persona, coherente con su comunidad autónoma.

Para cada persona se elige una PROVINCIA dentro de su comunidad (ponderada por
población) y se genera un CP válido: prefijo provincial (2 díg.) + 3 dígitos.
Así la distribución por comunidad autónoma (ya realista) se conserva.

Uso:  python populate_cp.py
"""

from __future__ import annotations

import random

from app.database import SessionLocal
from app.models import Persona

random.seed(2027)

# Comunidad -> [(código provincia, peso ~población)]
PROVINCIAS: dict[str, list[tuple[int, int]]] = {
    "Andalucía": [(41, 1950), (29, 1700), (11, 1250), (18, 920), (14, 780), (4, 730), (23, 630), (21, 530)],
    "Aragón": [(50, 970), (22, 225), (44, 134)],
    "Principado de Asturias": [(33, 1010)],
    "Islas Baleares": [(7, 1170)],
    "Canarias": [(35, 1130), (38, 1030)],
    "Cantabria": [(39, 585)],
    "Castilla y León": [(47, 520), (24, 445), (9, 355), (37, 330), (49, 170), (5, 160), (34, 160), (40, 155), (42, 90)],
    "Castilla-La Mancha": [(45, 710), (13, 495), (2, 390), (19, 265), (16, 195)],
    "Cataluña": [(8, 5700), (43, 830), (17, 780), (25, 440)],
    "Comunidad Valenciana": [(46, 2600), (3, 1900), (12, 600)],
    "Extremadura": [(6, 670), (10, 390)],
    "Galicia": [(15, 1120), (36, 940), (27, 325), (32, 305)],
    "Comunidad de Madrid": [(28, 6750)],
    "Región de Murcia": [(30, 1520)],
    "Navarra": [(31, 660)],
    "País Vasco": [(48, 1150), (20, 720), (1, 335)],
    "La Rioja": [(26, 320)],
}


# Alias de nombres cortos → comunidad canónica (personas antiguas)
ALIASES = {
    "Madrid": "Comunidad de Madrid", "Barcelona": "Cataluña",
    "Valencia": "Comunidad Valenciana", "Asturias": "Principado de Asturias",
    "Murcia": "Región de Murcia", "Baleares": "Islas Baleares",
    "Córdoba": "Andalucía", "Guadalajara": "Castilla-La Mancha",
}


def _cp_for(region: str | None) -> str | None:
    key = (region or "").strip()
    key = ALIASES.get(key, key)
    provs = PROVINCIAS.get(key)
    if not provs:
        return None
    codes, weights = zip(*provs)
    code = random.choices(codes, weights=weights, k=1)[0]
    return f"{code:02d}{random.randint(1, 999):03d}"


def main():
    db = SessionLocal()
    try:
        cambios = 0
        sin_region = 0
        for p in db.query(Persona).all():
            sd = dict(p.sociodemografico or {})
            # Solo residentes en España llevan CP español
            res = (sd.get("pais_residencia") or "").strip().lower()
            if res and res not in ("españa", "espana"):
                continue
            cp = _cp_for(sd.get("region"))
            if cp is None:
                sin_region += 1
                continue
            if sd.get("codigo_postal") != cp:
                sd["codigo_postal"] = cp
                p.sociodemografico = sd
                cambios += 1
        db.commit()
        print(f"Códigos postales asignados: {cambios}  (sin comunidad reconocida: {sin_region})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
