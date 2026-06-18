"""Genera N personas residentes en España de modo que el CONJUNTO (las ya
existentes + las nuevas) se aproxime a la pirámide poblacional de España
(franja de edad × sexo). Considera la base de datos actual.

Uso:  python seed_spain_pyramid.py [nuevas] [semilla]   (por defecto 600 / 600)
"""

from __future__ import annotations

import json
import random
import sys
from collections import defaultdict

from app.database import SessionLocal
from app.models import Persona
from app.services.llm import get_llm

NUEVAS = int(sys.argv[1]) if len(sys.argv) > 1 else 600
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 600
BATCH = 10
random.seed(SEED)

# --- Pirámide objetivo (población adulta 18+ de España, aprox. INE) ---
# (etiqueta, edad_min, edad_max, % de adultos, % mujeres en la franja)
BANDS = [
    ("18-24", 18, 24, 0.08, 0.49),
    ("25-34", 25, 34, 0.14, 0.49),
    ("35-44", 35, 44, 0.18, 0.49),
    ("45-54", 45, 54, 0.19, 0.50),
    ("55-64", 55, 64, 0.17, 0.51),
    ("65-74", 65, 74, 0.13, 0.53),
    ("75-84", 75, 84, 0.08, 0.58),
    ("85-95", 85, 95, 0.03, 0.67),
]
GENEROS_CELDA = ["Mujer", "Hombre"]

REGIONES = [
    ("Andalucía", 18), ("Cataluña", 16), ("Comunidad de Madrid", 14),
    ("Comunidad Valenciana", 11), ("Galicia", 5.7), ("Castilla y León", 5.1),
    ("País Vasco", 4.6), ("Canarias", 4.5), ("Castilla-La Mancha", 4.3),
    ("Región de Murcia", 3.2), ("Aragón", 2.8), ("Islas Baleares", 2.5),
    ("Extremadura", 2.2), ("Principado de Asturias", 2.1), ("Navarra", 1.4),
    ("Cantabria", 1.2), ("La Rioja", 0.7),
]
ORIGEN = [
    ("España", 85), ("Marruecos", 2.5), ("Rumanía", 2), ("Colombia", 1.5),
    ("Ecuador", 1), ("Venezuela", 1), ("Reino Unido", 0.8), ("Italia", 0.8),
    ("China", 0.7), ("Argentina", 0.7), ("Perú", 0.5), ("Senegal", 0.5),
]
POLITICA = [
    ("izquierda", 18), ("centro-izquierda", 22), ("centro", 18),
    ("centro-derecha", 20), ("derecha", 14), ("apolítico/abstencionista", 8),
]


def weighted(options):
    vals, weights = zip(*options)
    return random.choices(vals, weights=weights, k=1)[0]


def _band_index(edad) -> int | None:
    if edad is None:
        return None
    for i, (_, lo, hi, _, _) in enumerate(BANDS):
        if lo <= edad <= hi:
            return i
    if edad > 95:
        return len(BANDS) - 1
    return None


def _norm_genero(g) -> str | None:
    if not g:
        return None
    g = str(g).strip().lower()
    if g.startswith("muj") or g.startswith("fem"):
        return "Mujer"
    if g.startswith("hom") or g.startswith("masc") or g.startswith("var"):
        return "Hombre"
    return None  # no binario / otros -> fuera de las celdas de la pirámide


def largest_remainder(weights: dict, total: int) -> dict:
    keys = list(weights)
    s = sum(weights.values())
    if total <= 0:
        return {k: 0 for k in keys}
    if s <= 0:
        base = total // len(keys)
        out = {k: base for k in keys}
        for i in range(total - base * len(keys)):
            out[keys[i]] += 1
        return out
    raw = {k: weights[k] / s * total for k in keys}
    out = {k: int(raw[k]) for k in keys}
    rem = total - sum(out.values())
    for k in sorted(keys, key=lambda k: raw[k] - out[k], reverse=True)[:rem]:
        out[k] += 1
    return out


def build_slots():
    db = SessionLocal()
    try:
        personas = db.query(Persona).filter(Persona.activo.is_(True)).all()
    finally:
        db.close()
    actuales = len(personas)
    total = actuales + NUEVAS

    cells = [(bi, g) for bi in range(len(BANDS)) for g in GENEROS_CELDA]

    # Objetivo por celda según la pirámide, para el total final
    target = {}
    for bi, (_, _, _, share, fem) in enumerate(BANDS):
        target[(bi, "Mujer")] = total * share * fem
        target[(bi, "Hombre")] = total * share * (1 - fem)

    # Conteo actual por celda
    current = defaultdict(int)
    for p in personas:
        sd = p.sociodemografico or {}
        bi = _band_index(sd.get("edad"))
        g = _norm_genero(sd.get("genero"))
        if bi is not None and g in GENEROS_CELDA:
            current[(bi, g)] += 1

    # Déficit por celda y reparto de las NUEVAS
    deficit = {c: max(0.0, target[c] - current.get(c, 0)) for c in cells}
    total_def = sum(deficit.values())
    if total_def >= NUEVAS:
        alloc = largest_remainder(deficit, NUEVAS)
    else:
        alloc = {c: int(round(deficit[c])) for c in cells}
        restante = NUEVAS - sum(alloc.values())
        extra = largest_remainder({c: target[c] for c in cells}, max(0, restante))
        for c in cells:
            alloc[c] += extra.get(c, 0)
        # ajuste fino para cuadrar exactamente NUEVAS
        diff = NUEVAS - sum(alloc.values())
        for c in sorted(cells, key=lambda c: target[c], reverse=True)[:abs(diff)]:
            alloc[c] += 1 if diff > 0 else -1

    # Construir los slots concretos
    slots = []
    for (bi, g), n in alloc.items():
        _, lo, hi, _, _ = BANDS[bi]
        for _ in range(n):
            slots.append({
                "edad": random.randint(lo, hi),
                "genero": g,
                "region": weighted(REGIONES),
                "pais_origen": weighted(ORIGEN),
                "orientacion_politica": weighted(POLITICA),
            })
    random.shuffle(slots)
    print(f"Personas activas actuales: {actuales} · objetivo total: {total} · nuevas a crear: {len(slots)}")
    return slots


_SYSTEM = """Eres un experto en sociología e investigación de mercados en España.
Creas perfiles de personas sintéticas REALISTAS, diversas y socialmente verosímiles, que
residen en España. Cada persona debe ser internamente coherente (su edad, región, origen,
nivel educativo, ocupación, ingresos, consumo y valores encajan entre sí y con el contexto
español actual). No uses estereotipos planos. Respondes SIEMPRE en JSON válido y en español."""


def _prompt(slots_batch: list[dict]) -> str:
    return f"""Genera una persona por cada SLOT asignado. Respeta EXACTAMENTE la edad, género,
comunidad autónoma, país de origen y orientación política de cada slot (todos residen en España).

Slots (en este orden):
{json.dumps(slots_batch, ensure_ascii=False, indent=1)}

Para cada persona:
- Coherencia con el slot y con la realidad española (nombres, ciudad concreta dentro de su
  comunidad, ocupación, estudios e ingresos plausibles para su edad y zona).
- "bio": un perfil CLARO en 3-5 frases que explique quién es, su contexto vital y su carácter.
- "opinion.posicionamientos": una POSTURA TOMADA y concreta sobre los principales temas de la
  sociedad española actual: inmigración, vivienda y alquiler, economía y empleo, sanidad y
  servicios públicos, medio ambiente y cambio climático, igualdad de género, y tecnología/IA.
  Coherente con su orientación política asignada; con matices, no consignas de partido.
- No uses emojis.

Devuelve JSON con esta forma EXACTA:
{{
  "personas": [
    {{
      "nombre": "string",
      "tags": ["string"],
      "sociodemografico": {{
        "edad": 0, "genero": "string", "pais_origen": "string", "pais_residencia": "España",
        "region": "string", "nivel_educativo": "string", "ingresos": "string",
        "ocupacion": "string", "estado_civil": "string", "hogar": "string"
      }},
      "consumidor": {{
        "categorias_interes": ["string"], "marcas": ["string"], "habitos_gasto": "string",
        "canales": ["string"], "sensibilidad_precio": "string"
      }},
      "opinion": {{
        "valores_vida": ["string"], "actitudes": ["string"],
        "rasgos_personalidad": ["string"], "posicionamientos": "string"
      }},
      "bio": "string"
    }}
  ]
}}"""


def _merge(slot: dict, data: dict) -> Persona:
    sd = dict(data.get("sociodemografico", {}))
    sd["edad"] = slot["edad"]
    sd["genero"] = slot["genero"]
    sd["region"] = slot["region"]
    sd["pais_origen"] = slot["pais_origen"]
    sd["pais_residencia"] = "España"
    tags = list(data.get("tags", []))
    tags.append(slot["orientacion_politica"])
    return Persona(
        nombre=data.get("nombre", "Sin nombre"), idioma="es", origen="ai", activo=True,
        tags=tags, sociodemografico=sd, consumidor=data.get("consumidor", {}),
        opinion=data.get("opinion", {}), bio=data.get("bio", ""),
    )


def main():
    llm = get_llm()
    slots = build_slots()
    db = SessionLocal()
    creadas = 0
    try:
        for b in range(0, len(slots), BATCH):
            batch = slots[b:b + BATCH]
            data = llm.complete_json(_SYSTEM, _prompt(batch))
            for slot, pdata in zip(batch, data.get("personas", [])):
                db.add(_merge(slot, pdata))
                creadas += 1
            db.commit()
            print(f"  Lote {b // BATCH + 1}/{(len(slots) + BATCH - 1) // BATCH}: {creadas} acumuladas")
        total = db.query(Persona).filter(Persona.activo.is_(True)).count()
        print(f"\nHecho. {creadas} personas nuevas. Total activas: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
