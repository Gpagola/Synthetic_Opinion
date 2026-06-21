"""Ajusta la población inmigrada al 18,2 % nacional con cuota por comunidad (INE,
Censo 2024 — % de población nacida en el extranjero) y patrón de orígenes por
comunidad. NO modifica los inmigrantes ya existentes (sus bios citan su origen):
solo convierte residentes nacidos en España -> inmigrantes donde haya déficit,
priorizando edad laboral, y les asigna país de origen con sesgo regional realista.

Uso: python adjust_immigration.py
"""
import os, json, random
from collections import defaultdict
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
eng = create_engine(os.environ["DATABASE_URL"])
random.seed(20240101)

# % población nacida en el extranjero por comunidad (INE, Censo a 1-ene-2024)
TARGET_PCT = {
    "Andalucía": 12.44, "Aragón": 17.61, "Principado de Asturias": 10.34,
    "Islas Baleares": 27.65, "Canarias": 22.56, "Cantabria": 11.78,
    "Castilla y León": 13.98, "Castilla-La Mancha": 10.73, "Cataluña": 23.80,
    "Comunidad Valenciana": 22.51, "Extremadura": 5.59, "Galicia": 11.28,
    "Comunidad de Madrid": 23.80, "Región de Murcia": 19.49, "Navarra": 18.89,
    "País Vasco": 13.28, "La Rioja": 17.91,
}

# Pesos nacionales de país de nacimiento (miles, ~Censo 2024 / OPI)
BASE = {
    "Marruecos": 921, "Colombia": 857, "Venezuela": 600, "Rumanía": 532,
    "Ecuador": 449, "Argentina": 416, "Perú": 379, "Reino Unido": 285,
    "Francia": 217, "Ucrania": 216, "Honduras": 201, "República Dominicana": 201,
    "China": 199, "Portugal": 195, "Bolivia": 189, "Brasil": 179, "Alemania": 178,
    "Italia": 160, "Bulgaria": 113, "Pakistán": 109, "Paraguay": 95, "Cuba": 90,
    "Polonia": 85, "Senegal": 80, "Nicaragua": 75, "India": 70, "Rusia": 65,
    "México": 60, "Países Bajos": 60, "Chile": 58, "Uruguay": 55, "Argelia": 52,
    "Filipinas": 50, "Nigeria": 48, "Estados Unidos": 45, "Guinea": 45,
    "Gambia": 40, "Malí": 38,
}

# Multiplicadores regionales (default 1.0) según patrones reales de asentamiento
SKEW = {
    "Cataluña": {"Marruecos": 1.7, "China": 1.4, "Italia": 1.6, "Pakistán": 2.2,
                 "Rumanía": 0.6, "Reino Unido": 0.4, "Honduras": 1.2, "Senegal": 1.4},
    "Comunidad de Madrid": {"Colombia": 1.5, "Venezuela": 1.5, "Perú": 1.6,
                 "República Dominicana": 1.6, "Honduras": 1.5, "Rumanía": 1.4,
                 "China": 1.3, "Ecuador": 1.3, "Paraguay": 1.4, "Marruecos": 0.5,
                 "Reino Unido": 0.5},
    "Andalucía": {"Marruecos": 1.5, "Reino Unido": 1.7, "Ucrania": 1.1,
                 "Argentina": 0.9, "Rumanía": 0.9},
    "Comunidad Valenciana": {"Reino Unido": 3.0, "Rumanía": 1.6, "Italia": 1.3,
                 "Ucrania": 1.4, "Bolivia": 1.2, "Argelia": 1.3, "Marruecos": 0.7},
    "Canarias": {"Venezuela": 2.0, "Italia": 1.6, "Reino Unido": 1.8, "Alemania": 1.6,
                 "Colombia": 1.3, "Cuba": 1.6, "India": 1.5, "Marruecos": 0.6},
    "Islas Baleares": {"Alemania": 2.2, "Reino Unido": 1.6, "Argentina": 1.4,
                 "Italia": 1.6, "Colombia": 1.2, "Marruecos": 1.1},
    "Aragón": {"Rumanía": 2.4, "Marruecos": 1.2, "Senegal": 1.6, "Gambia": 1.6,
                 "China": 0.8},
    "Castilla-La Mancha": {"Rumanía": 2.6, "Marruecos": 1.3, "Reino Unido": 0.7},
    "Castilla y León": {"Rumanía": 1.6, "Bulgaria": 2.0, "Portugal": 1.6,
                 "Colombia": 1.1},
    "Galicia": {"Portugal": 2.4, "Brasil": 1.8, "Venezuela": 1.4, "Colombia": 1.2,
                 "Marruecos": 0.4, "Reino Unido": 0.7},
    "País Vasco": {"Colombia": 1.3, "Honduras": 1.4, "Nicaragua": 1.6, "Bolivia": 1.2,
                 "Marruecos": 0.9, "Rumanía": 0.7},
    "Navarra": {"Ecuador": 1.4, "Bulgaria": 1.5, "Marruecos": 1.1, "Argelia": 1.2},
    "La Rioja": {"Rumanía": 1.8, "Marruecos": 1.2, "Pakistán": 1.6},
    "Región de Murcia": {"Marruecos": 2.0, "Ecuador": 2.0, "Bolivia": 1.4,
                 "Reino Unido": 1.2, "Rumanía": 0.8},
    "Extremadura": {"Marruecos": 1.5, "Rumanía": 1.3, "Portugal": 1.8,
                 "Reino Unido": 0.8},
    "Principado de Asturias": {"Colombia": 1.3, "Venezuela": 1.3, "Brasil": 1.4,
                 "Marruecos": 0.7},
    "Cantabria": {"Colombia": 1.3, "Honduras": 1.2, "Marruecos": 0.8},
}


def origin_dist(region):
    mult = SKEW.get(region, {})
    w = {c: BASE[c] * mult.get(c, 1.0) for c in BASE}
    countries = list(w)
    weights = [w[c] for c in countries]
    return countries, weights


def age_weight(edad):
    """Los inmigrantes se concentran en edad laboral."""
    if edad is None:
        return 1.0
    e = int(edad)
    if 25 <= e <= 49:
        return 3.0
    if 18 <= e <= 24:
        return 1.6
    if 50 <= e <= 64:
        return 1.2
    return 0.35  # 65+


def is_foreign(d):
    po = (d.get("pais_origen") or "").strip().lower()
    return bool(po) and po not in ("españa", "espana")


with eng.begin() as cx:
    rows = cx.execute(text("SELECT id, sociodemografico FROM persona WHERE activo=1")).fetchall()
    by_region = defaultdict(list)
    for pid, sd in rows:
        d = json.loads(sd) if isinstance(sd, str) else sd
        by_region[d.get("region")].append((pid, d))

    total_conv = 0
    summary = []
    for region, members in by_region.items():
        tot = len(members)
        pct = TARGET_PCT.get(region)
        if pct is None:
            continue  # comunidad no reconocida / fuera de España
        target = round(pct / 100 * tot)
        cur_foreign = [m for m in members if is_foreign(m[1])]
        spanish = [m for m in members if not is_foreign(m[1])]
        deficit = target - len(cur_foreign)
        conv = 0
        if deficit > 0 and spanish:
            # elegir candidatos ponderando edad laboral
            scored = sorted(
                spanish,
                key=lambda m: age_weight(m[1].get("edad")) * (0.5 + random.random()),
                reverse=True,
            )
            chosen = scored[:deficit]
            countries, weights = origin_dist(region)
            for pid, d in chosen:
                pais = random.choices(countries, weights=weights, k=1)[0]
                d["pais_origen"] = pais
                d["pais_residencia"] = "España"
                cx.execute(
                    text("UPDATE persona SET sociodemografico=:s WHERE id=:i"),
                    {"s": json.dumps(d, ensure_ascii=False), "i": pid},
                )
                conv += 1
            total_conv += conv
        final_foreign = len(cur_foreign) + conv
        summary.append((region, tot, len(cur_foreign), target, final_foreign,
                        100 * final_foreign / tot))

print(f"Conversiones (nuevos inmigrantes): {total_conv}\n")
print(f"{'Comunidad':26}{'Total':>6}{'Antes':>7}{'Obj':>6}{'Final':>7}{'%':>7}")
for region, tot, before, target, final, p in sorted(summary, key=lambda x: -x[5]):
    print(f"{str(region)[:26]:26}{tot:>6}{before:>7}{target:>6}{final:>7}{p:>6.1f}%")
