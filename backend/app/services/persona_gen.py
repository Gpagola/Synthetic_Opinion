"""Generación de personas sintéticas con IA.

Recibe parámetros y devuelve borradores de personas (no se guardan aquí; el
usuario los revisa/edita antes de persistir).
"""

from __future__ import annotations

from app.countries import country_name, cultural_context_block, get_country
from app.schemas.persona import GenerateParams, PersonaBase
from app.services.llm import get_llm

_SYSTEM = """Eres un experto en investigación de mercados y sociología.
Generas perfiles de personas sintéticas realistas y coherentes para estudios de
opinión y consumo. Cada persona debe ser internamente consistente: su nivel
socioeconómico, ocupación, hábitos de consumo y valores deben encajar entre sí.
Evita estereotipos planos; crea individuos creíbles y diversos entre ellos.
Respondes SIEMPRE en JSON válido."""


def _build_prompt(params: GenerateParams) -> str:
    pais_nombre = country_name(params.pais) if params.pais else None
    restricciones = []
    if pais_nombre:
        restricciones.append(f"País de residencia: {pais_nombre}")
    if params.region:
        restricciones.append(f"Región: {params.region}")
    if params.edad_min is not None or params.edad_max is not None:
        lo = params.edad_min if params.edad_min is not None else 18
        hi = params.edad_max if params.edad_max is not None else 80
        restricciones.append(f"Rango de edad: {lo}-{hi} años")
    if params.segmento:
        restricciones.append(f"Segmento de consumo / perfil: {params.segmento}")
    if params.instrucciones:
        restricciones.append(f"Instrucciones adicionales: {params.instrucciones}")

    bloque_restr = "\n".join(f"- {r}" for r in restricciones) or "- Sin restricciones específicas"

    bloque_pais = ""
    if pais_nombre:
        c = get_country(params.pais)
        bloque_pais = (
            f"\n{cultural_context_block(params.pais)}\n\n"
            f"Haz que cada persona sea COHERENTE con la realidad de {pais_nombre}: nombres y "
            f"apellidos típicos, ciudad/región concreta del país, ocupaciones, marcas y hábitos "
            f"de consumo locales, e ingresos/precios en la moneda local. Los 'posicionamientos' "
            f"deben tomar postura sobre los temas de debate del país ({c['temas_pais']}), con "
            f"matices y sin consignas de partido.\n"
        )

    return f"""Genera {params.cantidad} personas sintéticas distintas entre sí.
Idioma de todos los textos: {params.idioma}.

Restricciones:
{bloque_restr}
{bloque_pais}
Devuelve un objeto JSON con esta forma EXACTA:
{{
  "personas": [
    {{
      "nombre": "string",
      "tags": ["string"],
      "sociodemografico": {{
        "edad": 0,
        "genero": "string",
        "pais_origen": "string (país donde nació)",
        "pais_residencia": "string (país donde vive ahora; suele coincidir con el de origen, pero algunas personas son migrantes/expats)",
        "region": "string",
        "nivel_educativo": "string",
        "ingresos": "string",
        "ocupacion": "string",
        "estado_civil": "string",
        "hogar": "string"
      }},
      "consumidor": {{
        "categorias_interes": ["string"],
        "marcas": ["string"],
        "habitos_gasto": "string",
        "canales": ["string"],
        "sensibilidad_precio": "string"
      }},
      "opinion": {{
        "valores_vida": ["string"],
        "actitudes": ["string"],
        "rasgos_personalidad": ["string"],
        "posicionamientos": "string"
      }},
      "bio": "Narrativa breve (2-4 frases) que resume al personaje y sirve para que actúe en primera persona."
    }}
  ]
}}"""


def generate_personas(params: GenerateParams) -> list[PersonaBase]:
    llm = get_llm()
    data = llm.complete_json(_SYSTEM, _build_prompt(params))
    raw = data.get("personas", [])
    personas: list[PersonaBase] = []
    pais_code = get_country(params.pais)["codigo"] if params.pais else "ES"
    for item in raw:
        item.setdefault("idioma", params.idioma)
        item["pais"] = pais_code  # país del escenario seleccionado
        # Validación/normalización vía Pydantic; ignora campos sobrantes.
        personas.append(PersonaBase.model_validate(item))
    return personas
