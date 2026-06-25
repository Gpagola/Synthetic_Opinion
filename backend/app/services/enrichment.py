"""Enriquecimiento de personas con matices A–H (composición familiar y vivienda,
vehículos, banca, seguros, telecom, perfil digital, laboral, consumo/hábitos).

Enfoque HÍBRIDO:
- El armazón categórico y las MARCAS se sortean estadísticamente (proporciones
  garantizadas) desde `app.countries[...]["enrichment"]`, condicionado al perfil
  ya existente de cada persona (edad, estado civil, nivel de ingresos, vivienda).
- Un LLM (modelo barato por defecto) rellena SOLO el texto de detalle (modelo de
  coche, nombre del colegio, redes/streaming, sector) por lotes, sin alterar los
  valores estadísticos.

Es un pase APARTE del seed: cubre tanto personas nuevas como antiguas. Idempotente:
salta las que ya tengan `sociodemografico["enriquecido"]`. No borra nada.
"""

from __future__ import annotations

import random
import time

from sqlalchemy.orm import Session

from app.countries import get_country
from app.database import SessionLocal
from app.models import Persona
from app.services.llm import _extract_json, get_llm

BATCH = 10
_TIER = {"Bajo": 0, "Medio-bajo": 1, "Medio": 2, "Medio-alto": 3, "Alto": 4}


def _w(options):
    """Sorteo ponderado sobre [(valor, peso), ...]."""
    vals, pesos = zip(*options)
    return random.choices(vals, weights=pesos, k=1)[0]


def _tier(sd: dict) -> int:
    return _TIER.get(sd.get("nivel_ingresos"), 2)


def _band(edad) -> str:
    e = edad or 40
    if e < 25: return "18-24"
    if e < 35: return "25-34"
    if e < 45: return "35-44"
    if e < 55: return "45-54"
    if e < 65: return "55-64"
    return "65+"


# ---------------------------------------------------------------------------
# A. Hogar y familia
# ---------------------------------------------------------------------------

_P_HIJOS = {"18-24": 0.08, "25-34": 0.35, "35-44": 0.70, "45-54": 0.80,
            "55-64": 0.74, "65+": 0.66}


def _hogar_familia(country: dict, sd: dict) -> dict:
    edad = sd.get("edad") or 40
    civil = (sd.get("estado_civil") or "").lower()
    tier = _tier(sd)
    en_pareja = any(t in civil for t in ("casad", "pareja", "conviv", "unión", "union"))
    soltero = "solter" in civil
    sep = any(t in civil for t in ("divorc", "separad", "viud"))

    p = _P_HIJOS[_band(edad)]
    if en_pareja: p = min(0.95, p * 1.25)
    elif soltero: p *= 0.45
    tiene_hijos = edad >= 20 and random.random() < p

    num = 0
    edades = []
    monoparental = False
    colegio = None
    nec_esp = adoptados = False
    if tiene_hijos:
        num = _w([(1, 40), (2, 38), (3, 15), (4, 7)])
        tope = max(1, min(edad - 18, 32))
        edades = sorted(random.randint(0, tope) for _ in range(num))
        p_mono = 0.10 * (3.0 if (sep or soltero) else 1.0)
        monoparental = random.random() < min(p_mono, 0.85)
        nec_esp = random.random() < 0.06
        adoptados = random.random() < 0.015
        if any(4 <= a <= 17 for a in edades):
            opts = country["enrichment"]["tipo_colegio"]
            # más privada/concertada a mayor renta
            ajust = [(v, w * (1 + 0.5 * tier) if ("priv" in v or "subv" in v or "concert" in v) else w)
                     for v, w in opts]
            colegio = _w(ajust)

    if tiene_hijos and monoparental:
        conviv = "monoparental con hijos"
    elif tiene_hijos:
        conviv = "en pareja con hijos"
    elif en_pareja:
        conviv = "en pareja, sin hijos"
    elif edad < 30 and not en_pareja:
        conviv = _w([("solo/a", 30), ("con sus padres", 45), ("piso compartido", 25)])
    elif edad >= 72:
        conviv = _w([("solo/a", 40), ("en pareja", 45), ("con familiares", 15)])
    else:
        conviv = _w([("solo/a", 55), ("en pareja", 30), ("piso compartido", 15)])

    regimen = _w(country["enrichment"]["regimen_vivienda"])
    if edad < 30:  # jóvenes: más alquiler
        regimen = _w([("alquiler", 5)] + [(v, w) for v, w in country["enrichment"]["regimen_vivienda"]])

    return {
        "tiene_hijos": tiene_hijos,
        "num_hijos": num,
        "edades_hijos": edades,
        "monoparental": monoparental,
        "hijos_necesidades_especiales": nec_esp,
        "hijos_adoptados": adoptados,
        "tipo_colegio_hijos": colegio,
        "convivencia": conviv,
        "cuida_dependientes": random.random() < (0.18 if 45 <= edad <= 64 else 0.08),
        "mascotas": _w([("ninguna", 45), ("perro", 30), ("gato", 17),
                        ("perro y gato", 5), ("otra", 3)]),
        "regimen_vivienda": regimen,
    }


# ---------------------------------------------------------------------------
# B. Vehículos
# ---------------------------------------------------------------------------

def _vehiculos(country: dict, sd: dict) -> dict:
    enr = country["enrichment"]
    tier = _tier(sd)
    p = min(0.92, 0.5 + tier * 0.09)
    tiene = random.random() < p
    if not tiene:
        return {"tiene_vehiculo": False, "num_vehiculos": 0, "principal": None,
                "usa_transporte_publico": random.random() < 0.8}
    combust = _w([(v, w * (1 + tier * 0.6) if ("híbr" in v or "eléctr" in v) else w)
                  for v, w in enr["combustible"]])
    if tier >= 3 and random.random() < 0.4:
        marca = random.choice(enr["marcas_coche_premium"])
    else:
        marca = _w(enr["marcas_coche"])
    antig = random.randint(0, 6) if tier >= 3 else random.randint(4, 18)
    return {
        "tiene_vehiculo": True,
        "num_vehiculos": _w([(1, 78), (2, 18), (3, 4)]),
        "principal": {
            "tipo": _w([("coche", 88), ("moto", 12)]),
            "combustible": combust,
            "marca": marca,
            "modelo": None,  # lo rellena el LLM
            "antiguedad_anios": antig,
            "adquisicion": _w([("usado", 62 - tier * 6), ("nuevo", 38 + tier * 6)]),
            "financiacion": _w([("contado", 45), ("financiado", 45), ("leasing/renting", 10)]),
        },
        "usa_transporte_publico": random.random() < 0.35,
    }


# ---------------------------------------------------------------------------
# C. Banca
# ---------------------------------------------------------------------------

def _banca(country: dict, sd: dict, regimen: str) -> dict:
    enr = country["enrichment"]
    edad = sd.get("edad") or 40
    tier = _tier(sd)
    es_cl = country["codigo"] == "CL"
    tipo = _w([("tradicional", 70 - (15 if edad < 35 else 0)),
               ("mixto", 22 + (10 if edad < 35 else 0)),
               ("digital", 8 + (8 if edad < 30 else 0))])
    secundarios = []
    if tipo in ("mixto", "digital"):
        secundarios = [random.choice(enr["bancos_digitales"])]

    productos = []
    if "hipoteca" in regimen or "dividendo" in regimen or "crédito" in regimen:
        productos.append("hipoteca/crédito hipotecario")
    if random.random() < 0.70:
        productos.append("tarjeta de crédito")
    if random.random() < 0.22:
        productos.append("préstamo personal")
    if random.random() < (0.08 + tier * 0.09):
        productos.append("inversión/fondos")
    if es_cl:
        productos.append("AFP (pensión obligatoria)")
    elif random.random() < (0.12 + tier * 0.08):
        productos.append("plan de pensiones")

    return {
        "banco_principal": _w(enr["bancos"]),
        "bancos_secundarios": secundarios,
        "tipo": tipo,
        "productos": productos,
        "nivel_endeudamiento": _w([("bajo", 40 + tier * 4), ("medio", 42), ("alto", 18 - tier * 2)]),
        "perfil_ahorro": _w([("ahorrador", 25 + tier * 6), ("justo", 50), ("endeudado", 25 - tier * 4)]),
    }


# ---------------------------------------------------------------------------
# D. Seguros
# ---------------------------------------------------------------------------

def _seguros(country: dict, sd: dict, veh: dict, regimen: str) -> dict:
    enr = country["enrichment"]
    tier = _tier(sd)
    aseg_principal = _w(enr["aseguradoras"])
    polizas = []
    if veh.get("tiene_vehiculo"):
        polizas.append({"tipo": "auto", "compania": aseg_principal})
    if "propiedad" in regimen and random.random() < 0.85:
        polizas.append({"tipo": "hogar", "compania": aseg_principal})
    elif "alquiler" in regimen or "arriendo" in regimen:
        if random.random() < 0.30:
            polizas.append({"tipo": "hogar", "compania": _w(enr["aseguradoras"])})
    if random.random() < (0.12 + tier * 0.08):
        polizas.append({"tipo": "vida", "compania": _w(enr["aseguradoras"])})
    if country["codigo"] == "ES" and random.random() < 0.35:
        polizas.append({"tipo": "decesos", "compania": _w(enr["aseguradoras"])})

    p_priv = min(0.95, enr["pct_salud_privada"] * (0.4 + tier * 0.5))
    if random.random() < p_priv:
        salud = {"cobertura": "privada", "compania": random.choice(enr["salud_privada"])}
    else:
        salud = {"cobertura": "pública", "compania": enr["etiqueta_salud_publica"]}
    return {"polizas": polizas, "salud": salud}


# ---------------------------------------------------------------------------
# E. Telecom
# ---------------------------------------------------------------------------

def _telecom(country: dict, sd: dict, regimen: str) -> dict:
    enr = country["enrichment"]
    edad = sd.get("edad") or 40
    tier = _tier(sd)
    prepago_w = 22 + (15 if tier <= 1 else 0) + (8 if edad < 25 else 0)
    if tier >= 3 and random.random() < 0.45 + tier * 0.05:
        smartphone = "iPhone (gama alta)"
    else:
        gama = _w([("gama baja", 30 - tier * 5), ("gama media", 50), ("gama alta", 20 + tier * 6)])
        smartphone = f"Android {gama}"
    return {
        "operador_movil": _w(enr["operadores_movil"]),
        "modalidad": _w([("contrato", 100 - prepago_w), ("prepago", prepago_w)]),
        "convergente_fibra": random.random() < (0.75 if "propiedad" in regimen else 0.5),
        "smartphone": smartphone,
    }


# ---------------------------------------------------------------------------
# F. Digital
# ---------------------------------------------------------------------------

def _digital(sd: dict) -> dict:
    edad = sd.get("edad") or 40
    if edad < 30: adop = _w([("alta", 70), ("media", 27), ("baja", 3)])
    elif edad < 50: adop = _w([("alta", 45), ("media", 45), ("baja", 10)])
    elif edad < 65: adop = _w([("alta", 22), ("media", 48), ("baja", 30)])
    else: adop = _w([("alta", 8), ("media", 37), ("baja", 55)])
    return {
        "adopcion_digital": adop,
        "redes_sociales": [],   # lo rellena el LLM según edad/perfil
        "streaming": [],        # idem
        "compra_online": adop != "baja" and random.random() < 0.8,
    }


# ---------------------------------------------------------------------------
# G. Laboral
# ---------------------------------------------------------------------------

def _laboral(country: dict, sd: dict) -> dict:
    edad = sd.get("edad") or 40
    tier = _tier(sd)
    ocup = (sd.get("ocupacion") or "").lower()
    if edad >= 66 or "jubilad" in ocup or "pensionad" in ocup:
        situacion = "jubilado/pensionado"
    elif "estudiante" in ocup:
        situacion = "estudiante"
    elif any(t in ocup for t in ("desemple", "paro", "busca")):
        situacion = "en paro"
    elif any(t in ocup for t in ("autónom", "autonom", "emprend", "freelance", "cuenta propia")):
        situacion = "autónomo/cuenta propia"
    elif any(t in ocup for t in ("funcionari", "público", "publico", "municipal", "estatal")):
        situacion = "funcionario/sector público"
    elif "hogar" in ocup or "casa" in ocup:
        situacion = "labores del hogar"
    else:
        situacion = _w([("asalariado", 70), ("autónomo/cuenta propia", 14),
                        ("funcionario/sector público", 10), ("en paro", 6 - tier)])

    if situacion == "asalariado":
        contrato = _w([("indefinido", 70 + tier * 4), ("temporal", 30 - tier * 4)])
        tamano = _w([("pyme", 55), ("gran empresa", 35), ("microempresa", 10)])
        tele = _w([("no", 60 - tier * 6), ("híbrido", 28 + tier * 4), ("total", 12 + tier * 2)])
    elif situacion.startswith("autónomo"):
        contrato, tamano, tele = "autónomo", "autónomo/microempresa", _w([("no", 55), ("híbrido", 25), ("total", 20)])
    elif situacion.startswith("funcionario"):
        contrato, tamano, tele = "plaza/contrato público", "sector público", _w([("no", 70), ("híbrido", 25), ("total", 5)])
    else:
        contrato, tamano, tele = "n/a", "n/a", "n/a"

    return {"situacion": situacion, "tipo_contrato": contrato, "teletrabajo": tele,
            "sector": None, "tamano_empresa": tamano}


# ---------------------------------------------------------------------------
# H. Consumo / hábitos
# ---------------------------------------------------------------------------

def _consumo_habitos(country: dict, sd: dict) -> dict:
    edad = sd.get("edad") or 40
    # Tabaquismo ~20%, menos a mayor nivel educativo
    edu = (sd.get("nivel_educativo_cat") or "")
    p_tabaco = 0.14 if ("Postgrado" in edu or "Universitario" in edu) else 0.24
    if edad < 30: deporte = _w([("sedentario", 28), ("ocasional", 42), ("regular", 30)])
    elif edad < 55: deporte = _w([("sedentario", 35), ("ocasional", 42), ("regular", 23)])
    else: deporte = _w([("sedentario", 50), ("ocasional", 35), ("regular", 15)])
    return {
        "supermercado_habitual": _w(country["enrichment"]["supermercados"]),
        "actividad_fisica": deporte,
        "fumador": random.random() < p_tabaco,
        "consumo_alcohol": _w([("nada", 25), ("ocasional", 55), ("habitual", 20)]),
    }


# ---------------------------------------------------------------------------
# Slot completo
# ---------------------------------------------------------------------------

def build_enrichment_slot(country_code: str, sd: dict) -> dict:
    """Sortea los 8 sub-objetos para una persona (su `sociodemografico`)."""
    country = get_country(country_code)
    a = _hogar_familia(country, sd)
    b = _vehiculos(country, sd)
    regimen = a["regimen_vivienda"]
    return {
        "hogar_familia": a,
        "vehiculos": b,
        "banca": _banca(country, sd, regimen),
        "seguros": _seguros(country, sd, b, regimen),
        "telecom": _telecom(country, sd, regimen),
        "digital": _digital(sd),
        "laboral": _laboral(country, sd),
        "consumo_habitos": _consumo_habitos(country, sd),
    }


# ---------------------------------------------------------------------------
# Pincelada LLM (texto de detalle) por lotes
# ---------------------------------------------------------------------------

def _perfil_breve(p: Persona) -> str:
    sd = p.sociodemografico or {}
    return (f"{p.nombre} · {sd.get('edad')} años · {sd.get('genero')} · {sd.get('region')} · "
            f"{sd.get('ocupacion')} · estudios: {sd.get('nivel_educativo')} · "
            f"ingresos: {sd.get('nivel_ingresos')} · {sd.get('estado_civil')}")


def _detalle_prompt(country_code: str, batch: list[tuple[Persona, dict]]) -> tuple[str, str]:
    c = get_country(country_code)
    system = (
        f"Eres un experto en perfiles de consumo en {c['nombre']}. Para cada persona te doy su "
        f"perfil y unos datos YA asignados (marca de coche, tipo de colegio, operador, etc.). "
        f"Devuelves SOLO los detalles de texto que faltan, COHERENTES con el perfil y con esos "
        f"datos (no los cambies). Marcas, lugares y nombres reales de {c['nombre']}. JSON válido."
    )
    fichas = []
    for i, (p, slot) in enumerate(batch):
        veh = slot["vehiculos"]
        marca = veh["principal"]["marca"] if veh.get("tiene_vehiculo") else "—"
        colegio = slot["hogar_familia"].get("tipo_colegio_hijos") or "—"
        fichas.append(
            f'#{i}: {_perfil_breve(p)}\n'
            f'   coche: {marca} ({veh["principal"]["combustible"] if veh.get("tiene_vehiculo") else "sin coche"}); '
            f'colegio_hijos: {colegio}; adopcion_digital: {slot["digital"]["adopcion_digital"]}; '
            f'situacion: {slot["laboral"]["situacion"]}'
        )
    user = (
        "Personas:\n" + "\n".join(fichas) +
        '\n\nDevuelve JSON {"detalles":[ ... ]} con un objeto por persona EN ORDEN, cada uno:\n'
        '{ "i": <índice>, "coche_modelo": "<modelo concreto acorde a la marca, o null si no tiene coche>", '
        '"colegio_nombre": "<nombre verosímil de colegio de su zona, o null si no aplica>", '
        '"sector_laboral": "<sector acorde a su ocupación>", '
        '"redes_sociales": ["..."], "streaming": ["..."] }\n'
        "Ajusta redes/streaming a su edad y adopción digital (alguien de adopción baja casi no usa)."
    )
    return system, user


def _aplicar_detalle(slot: dict, det: dict) -> None:
    veh = slot["vehiculos"]
    if veh.get("tiene_vehiculo") and det.get("coche_modelo"):
        veh["principal"]["modelo"] = det["coche_modelo"]
    if slot["hogar_familia"].get("tipo_colegio_hijos") and det.get("colegio_nombre"):
        slot["hogar_familia"]["colegio_nombre"] = det["colegio_nombre"]
    if det.get("sector_laboral"):
        slot["laboral"]["sector"] = det["sector_laboral"]
    if det.get("redes_sociales"):
        slot["digital"]["redes_sociales"] = det["redes_sociales"]
    if det.get("streaming"):
        slot["digital"]["streaming"] = det["streaming"]


def enrich_country(country_code: str, limit: int | None = None, seed: int = 0) -> None:
    """Enriquece (in-place, UPDATE) las personas del país que aún no lo estén.
    Resiliente: reintenta el LLM por lote y, si falla del todo, aplica solo el
    armazón estadístico (sin texto de detalle) en vez de abortar."""
    random.seed(seed)
    code = get_country(country_code)["codigo"]
    llm = get_llm()
    db: Session = SessionLocal()
    hechas = 0
    try:
        q = (db.query(Persona)
             .filter(Persona.pais == code, Persona.activo.is_(True))
             .order_by(Persona.id))
        personas = q.limit(limit).all() if limit else q.all()
        pend = [p for p in personas if not (p.sociodemografico or {}).get("enriquecido")]
        print(f"[{code}] a enriquecer: {len(pend)} (de {len(personas)} activas)")

        for b in range(0, len(pend), BATCH):
            grupo = pend[b:b + BATCH]
            slots = [(p, build_enrichment_slot(code, p.sociodemografico or {})) for p in grupo]

            data = None
            for intento in range(4):
                try:
                    system, user = _detalle_prompt(code, slots)
                    data = _extract_json(llm.complete_text(system, user))
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"  Lote {b // BATCH + 1}: error LLM ({type(e).__name__}); "
                          f"reintento {intento + 1}/4")
                    time.sleep(min(2 ** intento, 20))
            detalles = (data or {}).get("detalles", []) if isinstance(data, dict) else []
            by_i = {d.get("i"): d for d in detalles if isinstance(d, dict)}

            try:
                for idx, (p, slot) in enumerate(slots):
                    det = by_i.get(idx) or (detalles[idx] if idx < len(detalles) else None)
                    if isinstance(det, dict):
                        _aplicar_detalle(slot, det)
                    sd = dict(p.sociodemografico or {})
                    sd.update(slot)
                    sd["enriquecido"] = True
                    p.sociodemografico = sd
                    # SQLAlchemy no detecta mutaciones in-place del JSON: reasignar marca dirty.
                    hechas += 1
                db.commit()
            except Exception as e:  # noqa: BLE001
                db.rollback()
                print(f"  Lote {b // BATCH + 1}: error al guardar ({e}); descartado, sigo.")
                continue
            print(f"  Lote {b // BATCH + 1}/{(len(pend) + BATCH - 1) // BATCH}: {hechas} enriquecidas")
        print(f"\nHecho. {hechas} personas enriquecidas en {code}.")
    finally:
        db.close()
