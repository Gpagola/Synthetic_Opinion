"""Recruiting de participantes con IA — enfoque HÍBRIDO SQL/LLM.

Con bibliotecas grandes (miles de personas) no se puede mandar todo el catálogo
al LLM (excede el contexto). Estrategia:
  1. El LLM extrae criterios estructurados del perfil en texto libre (barato).
  2. Prefiltrado tipo SQL en Python por esos criterios.
  3. Se acota el pool (MAX_POOL) priorizando coincidencias de keywords + muestreo.
  4. El LLM elige los N finales (fichas compactas, sin bio) con su motivo.
"""

from __future__ import annotations

import json
import random
import re

from app.countries import country_name, region_names
from app.models import Persona
from app.services.llm import get_llm

MAX_POOL = 120  # máximo de candidatos enviados al LLM para la selección final

_SYSTEM = """Eres un experto en reclutamiento para estudios de mercado (recruiting de focus groups).
Seleccionas, de una lista de personas ya pre-filtrada, las que MEJOR encajan con el perfil de
público objetivo. Priorizas el encaje y, a igualdad, la diversidad. Solo eliges personas que
existan en la lista (usa sus 'id' exactos). Respondes SIEMPRE en JSON válido."""

_CRITERIA_SYSTEM = """Conviertes la descripción en lenguaje natural de un público objetivo en
filtros estructurados para buscar en una base de datos. Respondes SIEMPRE en JSON válido."""


def _norm_ingreso(s: str | None) -> str:
    t = (s or "").lower()
    if re.search(r"(medio|media).*(alto|alta)|(alto|alta).*(medio|media)", t): return "Medio-alto"
    if re.search(r"(medio|media).*(bajo|baja)|(bajo|baja).*(medio|media)", t): return "Medio-bajo"
    if re.search(r"medio|media", t): return "Medio"
    if re.search(r"bajo|baja", t): return "Bajo"
    if re.search(r"alto|alta", t): return "Alto"
    return "Otros"


def _norm_edu(s: str | None) -> str:
    t = (s or "").lower()
    if re.search(r"m[aá]ster|posgrado|postgrado|doctor|phd|mba", t): return "Postgrado"
    if re.search(r"formaci[oó]n profesional|\bfp\b|grado medio|grado superior|ciclo|t[eé]cnic", t): return "Formación Profesional"
    if re.search(r"universi|licenci|diplom|ingenier|\bgrado\b|superior", t): return "Universitario"
    if re.search(r"bachiller|\bbup\b|\bcou\b", t): return "Bachillerato"
    if re.search(r"secundaria|\beso\b|graduado escolar", t): return "Secundaria"
    if re.search(r"primaria|primarios|\begb\b", t): return "Primaria"
    if re.search(r"sin estudios|ninguno|analfabet", t): return "Sin estudios"
    return "Otros"


def _norm_gen(g: str | None) -> str:
    s = (g or "").lower()
    if s.startswith("muj") or s.startswith("fem"): return "Mujer"
    if s.startswith("hom") or s.startswith("masc") or s.startswith("var"): return "Hombre"
    return "Otro"


def extract_criteria(perfil: str, pais: str = "ES") -> dict:
    """El LLM traduce el perfil libre a filtros estructurados (solo usa el texto)."""
    llm = get_llm()
    regiones_pais = ", ".join(region_names(pais))
    user = f"""Perfil de público objetivo: "{perfil}"

Extrae filtros de búsqueda. Devuelve JSON con esta forma (usa null o [] si no se especifica):
{{
  "edad_min": <int o null>, "edad_max": <int o null>,
  "genero": "Mujer" | "Hombre" | null,
  "regiones": [<regiones de {country_name(pais)} mencionadas; opciones válidas: {regiones_pais}>],
  "pais_origen": <país o null; "extranjero" si pide nacidos fuera>,
  "ingresos": [<de: Bajo, Medio-bajo, Medio, Medio-alto, Alto>],
  "educacion": [<de: Sin estudios, Primaria, Secundaria, Bachillerato, Formación Profesional, Universitario, Postgrado>],
  "keywords": [<términos de ocupación, intereses o temas relevantes para afinar>]
}}"""
    try:
        return llm.complete_json(_CRITERIA_SYSTEM, user)
    except Exception:  # noqa: BLE001
        return {}


def _match_hard(p: Persona, crit: dict, pais: str = "ES") -> bool:
    sd = p.sociodemografico or {}
    edad = sd.get("edad")
    if crit.get("edad_min") and (edad is None or edad < crit["edad_min"]):
        return False
    if crit.get("edad_max") and (edad is None or edad > crit["edad_max"]):
        return False
    if crit.get("genero") and _norm_gen(sd.get("genero")) != crit["genero"]:
        return False
    regiones = crit.get("regiones") or []
    if regiones:
        reg = (sd.get("region") or "").lower()
        if not any(r.lower() in reg or reg in r.lower() for r in regiones):
            return False
    po = crit.get("pais_origen")
    if po:
        origen = (sd.get("pais_origen") or "").strip().lower()
        local = country_name(pais).strip().lower()
        if po.lower() == "extranjero":
            if not origen or origen == local:
                return False
        elif po.lower() not in origen and origen not in po.lower():
            return False
    ingresos = crit.get("ingresos") or []
    if ingresos and _norm_ingreso(sd.get("ingresos")) not in ingresos:
        return False
    educacion = crit.get("educacion") or []
    if educacion and _norm_edu(sd.get("nivel_educativo")) not in educacion:
        return False
    return True


def _kw_match(p: Persona, kws: list[str]) -> bool:
    sd = p.sociodemografico or {}
    hay = " ".join([
        " ".join(p.tags or []), sd.get("ocupacion") or "", p.bio or "",
        str(sd.get("consumidor") or ""), str(p.opinion or ""),
    ]).lower()
    return any(k.lower() in hay for k in kws)


def _select_pool(personas: list[Persona], crit: dict, cap: int, pais: str = "ES") -> list[Persona]:
    """Prefiltra (hard) + prioriza keywords + acota a `cap` con muestreo aleatorio."""
    hard = [p for p in personas if _match_hard(p, crit, pais)]
    if not hard:
        hard = list(personas)  # si nada encaja, no dejamos el recruiting vacío
    kws = crit.get("keywords") or []
    if kws:
        matches = [p for p in hard if _kw_match(p, kws)]
        rest = [p for p in hard if p not in matches]
    else:
        matches, rest = [], hard
    random.shuffle(matches)
    random.shuffle(rest)
    pool = (matches + rest)[:cap]
    random.shuffle(pool)
    return pool


def _brief(p: Persona) -> dict:
    sd = p.sociodemografico or {}
    return {
        "id": p.id, "nombre": p.nombre, "edad": sd.get("edad"),
        "genero": sd.get("genero"), "region": sd.get("region"),
        "pais_origen": sd.get("pais_origen"), "ocupacion": sd.get("ocupacion"),
        "ingresos": sd.get("ingresos"), "educacion": sd.get("nivel_educativo"),
        "tags": p.tags,
    }


def recruit(perfil: str, cantidad: int, personas: list[Persona], pais: str = "ES") -> list[dict]:
    """Devuelve [{persona_id, motivo}] con la selección propuesta."""
    if not personas:
        return []
    crit = extract_criteria(perfil, pais)
    pool = _select_pool(personas, crit, MAX_POOL, pais)
    llm = get_llm()
    user = f"""Perfil de público objetivo buscado:
"{perfil}"

Número de participantes a seleccionar: {cantidad}

Candidatos disponibles (ya pre-filtrados, JSON):
{json.dumps([_brief(p) for p in pool], ensure_ascii=False)}

Selecciona las {cantidad} personas que mejor encajan con el perfil. Si hay menos candidatos
válidos que la cantidad pedida, selecciona solo los que realmente encajen.
Devuelve JSON: {{"candidatos": [{{"persona_id": <id>, "motivo": "por qué encaja, 1 frase"}}]}}"""
    data = llm.complete_json(_SYSTEM, user)
    return data.get("candidatos", [])


def find_replacement(perfil: str, personas: list[Persona], exclude_ids: list[int],
                     pais: str = "ES") -> dict | None:
    """Sugiere UNA persona alternativa que encaje, distinta de las excluidas."""
    excl = set(exclude_ids)
    disponibles = [p for p in personas if p.id not in excl]
    if not disponibles:
        return None
    crit = extract_criteria(perfil, pais)
    pool = _select_pool(disponibles, crit, MAX_POOL, pais)
    llm = get_llm()
    user = f"""Perfil de público objetivo buscado:
"{perfil}"

Necesito UNA persona alternativa que encaje con el perfil, distinta de las ya seleccionadas.
Candidatos disponibles (ya pre-filtrados, JSON):
{json.dumps([_brief(p) for p in pool], ensure_ascii=False)}

Devuelve JSON: {{"persona_id": <id o null>, "motivo": "por qué encaja, 1 frase"}}
Si ninguno encaja razonablemente, devuelve {{"persona_id": null, "motivo": ""}}."""
    data = llm.complete_json(_SYSTEM, user)
    return data if data.get("persona_id") else None
