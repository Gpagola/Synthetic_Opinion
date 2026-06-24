"""Generación de población sintética representativa, parametrizada por país.

Construye N personas de modo que el CONJUNTO (las ya existentes del país + las
nuevas) se aproxime a la pirámide poblacional (franja de edad × sexo) del país,
con regiones, inmigración y orientación política según la configuración de
`app.countries`. Es el núcleo compartido por los scripts `seed_*_pyramid.py`.
"""

from __future__ import annotations

import json
import random
import time
from collections import defaultdict

from app.countries import (
    country_name,
    cultural_context_block,
    get_country,
)
from app.database import SessionLocal
from app.models import Persona
from app.services.llm import get_llm

BATCH = 10
GENEROS_CELDA = ["Mujer", "Hombre"]


def weighted(options):
    vals, weights = zip(*options)
    return random.choices(vals, weights=weights, k=1)[0]


def _age_factor(edad: int) -> float:
    # Los nacidos fuera se concentran en edad laboral
    if edad < 25:
        return 1.0
    if edad <= 49:
        return 1.35
    if edad <= 64:
        return 0.8
    return 0.35


def _origin(country: dict, region: str, edad: int) -> str:
    share = country["foreign_share"].get(region, country["foreign_share_default"])
    p = share * _age_factor(edad)
    if random.random() < min(p, 0.92):
        return weighted(country["foreign_countries"])
    return country["nombre"]


def _band_index(edad, bands) -> int | None:
    if edad is None:
        return None
    for i, (_, lo, hi, _, _) in enumerate(bands):
        if lo <= edad <= hi:
            return i
    if edad > bands[-1][2]:
        return len(bands) - 1
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


def build_slots(country_code: str, nuevas: int) -> list[dict]:
    """Reparte `nuevas` personas entre las celdas (edad×sexo) según el déficit
    respecto a la pirámide objetivo del país, considerando las personas YA
    existentes de ese país en la base de datos."""
    country = get_country(country_code)
    bands = country["pyramid_bands"]
    db = SessionLocal()
    try:
        personas = (
            db.query(Persona)
            .filter(Persona.activo.is_(True), Persona.pais == country["codigo"])
            .all()
        )
    finally:
        db.close()
    actuales = len(personas)
    total = actuales + nuevas

    cells = [(bi, g) for bi in range(len(bands)) for g in GENEROS_CELDA]

    target = {}
    for bi, (_, _, _, share, fem) in enumerate(bands):
        target[(bi, "Mujer")] = total * share * fem
        target[(bi, "Hombre")] = total * share * (1 - fem)

    current = defaultdict(int)
    for p in personas:
        sd = p.sociodemografico or {}
        bi = _band_index(sd.get("edad"), bands)
        g = _norm_genero(sd.get("genero"))
        if bi is not None and g in GENEROS_CELDA:
            current[(bi, g)] += 1

    deficit = {c: max(0.0, target[c] - current.get(c, 0)) for c in cells}
    total_def = sum(deficit.values())
    if total_def >= nuevas:
        alloc = largest_remainder(deficit, nuevas)
    else:
        alloc = {c: int(round(deficit[c])) for c in cells}
        restante = nuevas - sum(alloc.values())
        extra = largest_remainder({c: target[c] for c in cells}, max(0, restante))
        for c in cells:
            alloc[c] += extra.get(c, 0)
        diff = nuevas - sum(alloc.values())
        for c in sorted(cells, key=lambda c: target[c], reverse=True)[:abs(diff)]:
            alloc[c] += 1 if diff > 0 else -1

    edu_cfg = country.get("educacion")
    slots = []
    for (bi, g), n in alloc.items():
        _, lo, hi, _, _ = bands[bi]
        for _ in range(n):
            edad = random.randint(lo, hi)
            region = weighted(country["regiones"])
            slot = {
                "edad": edad,
                "genero": g,
                "region": region,
                "pais_origen": _origin(country, region, edad),
                "orientacion_politica": weighted(country["politica"]),
            }
            # Educación e ingresos calibrados (solo países que lo definen, p.ej.
            # Chile). El ingreso se condiciona a la educación para mantener
            # coherencia. España no define `educacion` -> slot sin estas claves.
            if edu_cfg:
                nat, cat = weighted([((n_, c_), w_) for (n_, c_, w_) in edu_cfg])
                slot["nivel_educativo"] = nat          # etiqueta natural (display + LLM)
                slot["nivel_educativo_cat"] = cat      # categoría canónica (stats)
                slot["nivel_ingresos"] = weighted(country["ingresos_por_educacion"][cat])
            slots.append(slot)
    random.shuffle(slots)
    print(f"[{country['nombre']}] activas actuales: {actuales} · objetivo total: "
          f"{total} · nuevas a crear: {len(slots)}")
    return slots


def _system_prompt(country_code: str) -> str:
    c = get_country(country_code)
    return (
        f"Eres un experto en sociología e investigación de mercados en {c['nombre']}.\n"
        f"Creas perfiles de personas sintéticas REALISTAS, diversas y socialmente verosímiles, "
        f"que residen en {c['nombre']}. Cada persona debe ser internamente coherente (su edad, "
        f"región, origen, nivel educativo, ocupación, ingresos, consumo y valores encajan entre "
        f"sí y con el contexto actual de {c['nombre']}). No uses estereotipos planos. Respondes "
        f"SIEMPRE en JSON válido y en español.\n\n{cultural_context_block(country_code)}"
    )


def _batch_prompt(country_code: str, slots_batch: list[dict]) -> str:
    c = get_country(country_code)
    calibra = bool(c.get("educacion"))
    # Vista de slots para el prompt: ocultamos `nivel_educativo_cat` (uso interno
    # para las estadísticas) y mostramos solo lo que el LLM debe respetar.
    slots_view = [{k: v for k, v in s.items() if k != "nivel_educativo_cat"} for s in slots_batch]
    extra = ""
    if calibra:
        anclas = "; ".join(f"{k}: {v}" for k, v in c["ingresos_anclas"].items())
        extra = (
            f"\n- ADEMÁS, respeta EXACTAMENTE `nivel_educativo` (nivel de estudios) y "
            f"`nivel_ingresos` (clase socioeconómica) de cada slot. La ocupación, la bio y el "
            f"estilo de vida deben ser coherentes con ese nivel educativo y esa clase.\n"
            f"- El campo `ingresos` que devuelvas debe ser un IMPORTE realista en la moneda local "
            f"de {c['nombre']}, coherente con la clase `nivel_ingresos` del slot, según estas anclas "
            f"mensuales: {anclas}. Copia `nivel_educativo` y `nivel_ingresos` tal cual en la salida."
        )
    return f"""Genera una persona por cada SLOT asignado. Respeta EXACTAMENTE la edad, género,
región, país de origen y orientación política de cada slot (todos residen en {c['nombre']}).

Slots (en este orden):
{json.dumps(slots_view, ensure_ascii=False, indent=1)}

Para cada persona:
- Coherencia con el slot y con la realidad de {c['nombre']} (nombres y apellidos típicos, ciudad
  concreta dentro de su región, ocupación, estudios e ingresos plausibles para su edad y zona,
  marcas y hábitos de consumo locales, moneda local).{extra}
- "codigo_postal": código postal REAL y plausible de la ciudad/zona concreta de su región, con el
  formato propio de {c['nombre']} (en España 5 dígitos cuyos 2 primeros identifican la provincia).
- "bio": un perfil CLARO en 3-5 frases que explique quién es, su contexto vital y su carácter.
- "opinion.posicionamientos": una POSTURA TOMADA y concreta sobre los principales temas de la
  sociedad actual de {c['nombre']}: {c['temas_pais']}. Coherente con su orientación política
  asignada; con matices, no consignas de partido.
- No uses emojis.

Devuelve JSON con esta forma EXACTA:
{{
  "personas": [
    {{
      "nombre": "string",
      "tags": ["string"],
      "sociodemografico": {{
        "edad": 0, "genero": "string", "pais_origen": "string", "pais_residencia": "{c['nombre']}",
        "region": "string", "codigo_postal": "string", "nivel_educativo": "string", "ingresos": "string",
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


def _merge(country_code: str, slot: dict, data: dict) -> Persona:
    c = get_country(country_code)
    sd = dict(data.get("sociodemografico", {}))
    sd["edad"] = slot["edad"]
    sd["genero"] = slot["genero"]
    sd["region"] = slot["region"]
    sd["pais_origen"] = slot["pais_origen"]
    sd["pais_residencia"] = c["nombre"]
    # Educación e ingresos calibrados: se fuerzan desde el slot (la categoría
    # canónica alimenta las estadísticas; el importe `ingresos` del LLM se
    # conserva para el detalle). España no trae estas claves -> sin cambios.
    if "nivel_educativo" in slot:
        sd["nivel_educativo"] = slot["nivel_educativo"]
        sd["nivel_educativo_cat"] = slot["nivel_educativo_cat"]
        sd["nivel_ingresos"] = slot["nivel_ingresos"]
    tags = list(data.get("tags", []))
    tags.append(slot["orientacion_politica"])
    return Persona(
        nombre=data.get("nombre", "Sin nombre"), idioma=c["idioma"], pais=c["codigo"],
        origen="ai", activo=True, tags=tags, sociodemografico=sd,
        consumidor=data.get("consumidor", {}), opinion=data.get("opinion", {}),
        bio=data.get("bio", ""),
    )


def run_seed(country_code: str, nuevas: int, seed: int) -> None:
    """Punto de entrada de los scripts seed_*_pyramid.py."""
    random.seed(seed)
    llm = get_llm()
    slots = build_slots(country_code, nuevas)
    db = SessionLocal()
    creadas = 0
    try:
        n_lotes = (len(slots) + BATCH - 1) // BATCH
        for b in range(0, len(slots), BATCH):
            batch = slots[b:b + BATCH]
            lote = b // BATCH + 1
            # Reintentos con backoff: un error transitorio del LLM (rate limit,
            # timeout) NO debe matar todo el seed. Si el lote falla tras varios
            # intentos, se omite y se continúa con el siguiente.
            data = None
            for intento in range(5):
                try:
                    data = llm.complete_json(_system_prompt(country_code),
                                             _batch_prompt(country_code, batch))
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"  Lote {lote}/{n_lotes}: error LLM ({type(e).__name__}: {e}); "
                          f"reintento {intento + 1}/5")
                    time.sleep(min(2 ** intento, 30))
            if data is None:
                print(f"  Lote {lote}/{n_lotes}: OMITIDO tras 5 fallos; sigo.")
                continue
            try:
                for slot, pdata in zip(batch, data.get("personas", [])):
                    db.add(_merge(country_code, slot, pdata))
                    creadas += 1
                db.commit()
            except Exception as e:  # noqa: BLE001
                db.rollback()
                print(f"  Lote {lote}/{n_lotes}: error al guardar ({e}); lote descartado, sigo.")
                continue
            print(f"  Lote {lote}/{n_lotes}: {creadas} acumuladas")
        total = (
            db.query(Persona)
            .filter(Persona.activo.is_(True), Persona.pais == get_country(country_code)["codigo"])
            .count()
        )
        print(f"\nHecho. {creadas} personas nuevas en {country_name(country_code)}. "
              f"Total activas del país: {total}")
    finally:
        db.close()
