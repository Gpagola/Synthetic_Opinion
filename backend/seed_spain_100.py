"""Genera 100 personas sintéticas representativas de España y las guarda en BBDD.

Estrategia: se PRE-ASIGNAN cuotas muestreando distribuciones aproximadas de España
(edad, sexo, comunidad autónoma, país de origen, orientación política). Luego el LLM
rellena cada perfil de forma coherente, con bio clara y postura sobre los temas clave.

Uso:  python seed_spain_100.py
"""

from __future__ import annotations

import json
import random
import sys

from app.database import SessionLocal
from app.models import Persona
from app.services.llm import get_llm

# Uso: python seed_spain_100.py [cantidad] [semilla]
TOTAL = int(sys.argv[1]) if len(sys.argv) > 1 else 100
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 42
BATCH = 10

random.seed(SEED)  # reproducible

# --- Distribuciones aproximadas de España (población adulta) ---
EDAD_BANDAS = [((18, 29), 16), ((30, 44), 25), ((45, 59), 28), ((60, 74), 19), ((75, 90), 12)]
GENEROS = [("Mujer", 51), ("Hombre", 48), ("No binario", 1)]
REGIONES = [
    ("Andalucía", 18), ("Cataluña", 16), ("Comunidad de Madrid", 14),
    ("Comunidad Valenciana", 11), ("Galicia", 5.7), ("Castilla y León", 5.1),
    ("País Vasco", 4.6), ("Canarias", 4.5), ("Castilla-La Mancha", 4.3),
    ("Región de Murcia", 3.2), ("Aragón", 2.8), ("Islas Baleares", 2.5),
    ("Extremadura", 2.2), ("Principado de Asturias", 2.1), ("Navarra", 1.4),
    ("Cantabria", 1.2), ("La Rioja", 0.7),
]
# País de origen: 85% España, 15% nacidos fuera (perfiles migrantes reales en España)
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


def build_slots():
    slots = []
    for _ in range(TOTAL):
        (lo, hi) = weighted(EDAD_BANDAS)
        slots.append({
            "edad": random.randint(lo, hi),
            "genero": weighted(GENEROS),
            "region": weighted(REGIONES),
            "pais_origen": weighted(ORIGEN),
            "orientacion_politica": weighted(POLITICA),
        })
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
        "rasgos_personalidad": ["string"], "posicionamientos": "string (postura sobre los temas clave)"
      }},
      "bio": "string"
    }}
  ]
}}"""


def _merge(slot: dict, data: dict) -> Persona:
    sd = dict(data.get("sociodemografico", {}))
    # Garantiza la representatividad: el slot manda en estos campos
    sd["edad"] = slot["edad"]
    sd["genero"] = slot["genero"]
    sd["region"] = slot["region"]
    sd["pais_origen"] = slot["pais_origen"]
    sd["pais_residencia"] = "España"
    tags = list(data.get("tags", []))
    tags.append(slot["orientacion_politica"])
    return Persona(
        nombre=data.get("nombre", "Sin nombre"),
        idioma="es",
        origen="ai",
        activo=True,
        tags=tags,
        sociodemografico=sd,
        consumidor=data.get("consumidor", {}),
        opinion=data.get("opinion", {}),
        bio=data.get("bio", ""),
    )


def main():
    llm = get_llm()
    slots = build_slots()
    db = SessionLocal()
    creadas = 0
    try:
        for b in range(0, TOTAL, BATCH):
            batch = slots[b:b + BATCH]
            data = llm.complete_json(_SYSTEM, _prompt(batch))
            personas = data.get("personas", [])
            for slot, pdata in zip(batch, personas):
                db.add(_merge(slot, pdata))
                creadas += 1
            db.commit()
            print(f"  Lote {b // BATCH + 1}/{TOTAL // BATCH}: {creadas} personas acumuladas")
        total = db.query(Persona).filter(Persona.activo.is_(True)).count()
        print(f"\nHecho. {creadas} personas nuevas. Total activas en BBDD: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
