"""Registro de configuración por país (escenarios).

Centraliza TODO lo específico de cada país: nombre, idioma, regiones y sus pesos
poblacionales, pirámide adulta edad×sexo, distribuciones de inmigración y de
orientación política, y un BLOQUE CULTURAL curado (modismos, marcas, lugares,
referentes) que se inyecta en los prompts del LLM para que las personas
sintéticas hablen y opinen como gente real de ese país.

Es la ÚNICA fuente de verdad de estos datos en el backend: los scripts de
población (seed_*) y los motores (focus, encuestas, generación, recruiting) los
leen de aquí. Los datos de España se migraron desde el antiguo
`seed_spain_pyramid.py`.

Códigos ISO-3166 alpha-2: "ES" (España), "CL" (Chile).
"""

from __future__ import annotations

DEFAULT_COUNTRY = "ES"


# ---------------------------------------------------------------------------
# ESPAÑA
# ---------------------------------------------------------------------------

_ES = {
    "codigo": "ES",
    "nombre": "España",
    "gentilicio": "española",
    "idioma": "es",
    "fuente_demografica": "INE 2024",
    # (etiqueta, edad_min, edad_max, % de adultos, % mujeres en la franja)
    "pyramid_bands": [
        ("18-24", 18, 24, 0.08, 0.49),
        ("25-34", 25, 34, 0.14, 0.49),
        ("35-44", 35, 44, 0.18, 0.49),
        ("45-54", 45, 54, 0.19, 0.50),
        ("55-64", 55, 64, 0.17, 0.51),
        ("65-74", 65, 74, 0.13, 0.53),
        ("75-84", 75, 84, 0.08, 0.58),
        ("85-95", 85, 95, 0.03, 0.67),
    ],
    # (región, peso poblacional %)
    "regiones": [
        ("Andalucía", 18), ("Cataluña", 16), ("Comunidad de Madrid", 14),
        ("Comunidad Valenciana", 11), ("Galicia", 5.7), ("Castilla y León", 5.1),
        ("País Vasco", 4.6), ("Canarias", 4.5), ("Castilla-La Mancha", 4.3),
        ("Región de Murcia", 3.2), ("Aragón", 2.8), ("Islas Baleares", 2.5),
        ("Extremadura", 2.2), ("Principado de Asturias", 2.1), ("Navarra", 1.4),
        ("Cantabria", 1.2), ("La Rioja", 0.7),
    ],
    # % de población nacida en el extranjero por región (aprox. INE 2024)
    "foreign_share": {
        "Islas Baleares": 0.27, "Cataluña": 0.22, "Comunidad de Madrid": 0.22,
        "Canarias": 0.22, "Comunidad Valenciana": 0.21, "Región de Murcia": 0.18,
        "La Rioja": 0.17, "Aragón": 0.16, "Navarra": 0.16, "Andalucía": 0.12,
        "Castilla-La Mancha": 0.12, "País Vasco": 0.11, "Cantabria": 0.09,
        "Castilla y León": 0.09, "Principado de Asturias": 0.07, "Galicia": 0.07,
        "Extremadura": 0.05,
    },
    "foreign_share_default": 0.10,
    # Mezcla de país de origen entre los nacidos fuera (principales colectivos)
    "foreign_countries": [
        ("Marruecos", 15), ("Rumanía", 9), ("Colombia", 9), ("Venezuela", 7),
        ("Reino Unido", 5), ("Italia", 5), ("China", 4), ("Ecuador", 4),
        ("Argentina", 4), ("Perú", 3), ("Honduras", 3), ("Ucrania", 3),
        ("Bulgaria", 2), ("Alemania", 2), ("Francia", 2), ("Senegal", 2),
        ("Bolivia", 2), ("Pakistán", 2), ("Portugal", 2), ("Brasil", 2),
    ],
    "politica": [
        ("izquierda", 18), ("centro-izquierda", 22), ("centro", 18),
        ("centro-derecha", 20), ("derecha", 14), ("apolítico/abstencionista", 8),
    ],
    # Educación: (etiqueta_natural_para_el_LLM, categoría_canónica, peso).
    # Calibrado a la estructura educativa adulta de España (INE / Eurostat 2023:
    # estructura "reloj de arena" con terciaria alta ~40% y bastante ISCED 0-2).
    "educacion": [
        ("Postgrado (máster o doctorado)",                       "Postgrado (máster/doctorado)",                  9),
        ("Universitario (grado/licenciatura o FP superior)",     "Universitario (grado/diplomatura/FP superior)", 30),
        ("FP de grado medio",                                    "Formación Profesional (grado medio)",           11),
        ("Bachillerato",                                         "Bachillerato",                                  11),
        ("Educación Secundaria Obligatoria (ESO)",               "Secundaria (1ª etapa / ESO)",                   22),
        ("Educación primaria",                                   "Primaria",                                      11),
        ("Sin estudios",                                         "Sin estudios",                                   6),
    ],
    # Clase de ingreso CONDICIONADA al nivel educativo (coherencia interna).
    # España es menos desigual que Chile: más masa en el centro.
    "ingresos_por_educacion": {
        "Postgrado (máster/doctorado)":                  [("Alto", 30), ("Medio-alto", 38), ("Medio", 27), ("Medio-bajo", 5), ("Bajo", 0)],
        "Universitario (grado/diplomatura/FP superior)": [("Alto", 14), ("Medio-alto", 32), ("Medio", 38), ("Medio-bajo", 12), ("Bajo", 4)],
        "Formación Profesional (grado medio)":           [("Alto", 3), ("Medio-alto", 14), ("Medio", 45), ("Medio-bajo", 28), ("Bajo", 10)],
        "Bachillerato":                                  [("Alto", 2), ("Medio-alto", 10), ("Medio", 42), ("Medio-bajo", 32), ("Bajo", 14)],
        "Secundaria (1ª etapa / ESO)":                   [("Alto", 1), ("Medio-alto", 6), ("Medio", 33), ("Medio-bajo", 38), ("Bajo", 22)],
        "Primaria":                                      [("Alto", 0), ("Medio-alto", 3), ("Medio", 20), ("Medio-bajo", 40), ("Bajo", 37)],
        "Sin estudios":                                  [("Alto", 0), ("Medio-alto", 1), ("Medio", 12), ("Medio-bajo", 30), ("Bajo", 57)],
    },
    # Anclas de ingreso mensual neto (€) por clase, para importes realistas.
    "ingresos_anclas": {
        "Bajo":       "menos de 1.000 € al mes",
        "Medio-bajo": "entre 1.000 y 1.500 € al mes",
        "Medio":      "entre 1.500 y 2.500 € al mes",
        "Medio-alto": "entre 2.500 y 4.000 € al mes",
        "Alto":       "más de 4.000 € al mes",
    },
    # Temas de debate público del país (para posicionamientos en la generación)
    "temas_pais": (
        "inmigración, vivienda y alquiler, economía y empleo, sanidad y servicios "
        "públicos, medio ambiente y cambio climático, igualdad de género, y "
        "tecnología/IA"
    ),
    # BLOQUE CULTURAL curado. Texto que se inyecta en los prompts del LLM.
    "contexto_cultural": """Español de España (castellano peninsular).
- MODISMOS Y MULETILLAS: "vale", "tío/tía", "majo", "guay", "flipar", "currar",
  "movida", "mogollón", "qué fuerte", "en plan", "joder/jolín", "venga", "hostia".
  Marca el deje regional sin caricaturizar: andaluz (ceceo/seseo, "miarma"),
  catalán, gallego ("morriña"), vasco, canario ("guagua", "chacho"), madrileño.
- MARCAS Y CADENAS: Mercadona, El Corte Inglés, Carrefour, Lidl, Zara/Inditex,
  Movistar, Vodafone, BBVA/Santander/CaixaBank, Repsol, Iberia, Renfe, Glovo,
  Día, Decathlon, Amazon.
- LUGARES Y VIDA COTIDIANA: el barrio, el pueblo, comunidades autónomas y sus
  capitales, la sierra, la playa, el bar de siempre, las cañas, la siesta,
  Mercadona los sábados, la Renfe/el Cercanías, la ITV.
- REFERENTES: TV (Telecinco, Antena 3, RTVE, El Hormiguero), fútbol
  (LaLiga, Real Madrid, Barça), prensa (El País, El Mundo), política española
  actual sin consignas de partido.
- DINERO: euros (€); sueldos y precios en cifras realistas de España.""",
}


# ---------------------------------------------------------------------------
# CHILE
# ---------------------------------------------------------------------------
# Cifras oficiales del INE de Chile:
#  - Población por región: Censo 2024 (18.480.432 personas censadas).
#  - Estructura por edad/sexo: Censo 2024 (51,5% mujeres; <15 = 17,7%; 65+ = 14%)
#    afinada con la estructura quinquenal por sexo (proyecciones INE / WFB).
#  - Inmigración: INE–SERMIG "Estimación de personas extranjeras residentes
#    habituales en Chile 2023" (1.918.583 personas, 9,91% de la población).

_CL = {
    "codigo": "CL",
    "nombre": "Chile",
    "gentilicio": "chilena",
    "idioma": "es",
    "fuente_demografica": "Censo INE Chile 2024",
    # (etiqueta, edad_min, edad_max, % de adultos, % mujeres en la franja)
    # Reparto de adultos 18+ coherente con el Censo 2024 (envejecimiento:
    # 65+ ≈ 14% del total) y con el sesgo femenino creciente por edad.
    "pyramid_bands": [
        ("18-24", 18, 24, 0.126, 0.49),
        ("25-34", 25, 34, 0.199, 0.50),
        ("35-44", 35, 44, 0.190, 0.50),
        ("45-54", 45, 54, 0.164, 0.51),
        ("55-64", 55, 64, 0.143, 0.53),
        ("65-74", 65, 74, 0.106, 0.55),
        ("75-84", 75, 84, 0.054, 0.58),
        ("85-95", 85, 95, 0.018, 0.66),
    ],
    # 16 regiones (norte → sur). Peso = % de la población nacional, Censo 2024.
    "regiones": [
        ("Región Metropolitana de Santiago", 40.05),
        ("Región de Valparaíso", 10.26),
        ("Región del Biobío", 8.73),
        ("Región del Maule", 6.08),
        ("Región de La Araucanía", 5.47),
        ("Región del Libertador General Bernardo O'Higgins", 5.34),
        ("Región de Los Lagos", 4.82),
        ("Región de Coquimbo", 4.51),
        ("Región de Antofagasta", 3.44),
        ("Región de Ñuble", 2.77),
        ("Región de Los Ríos", 2.15),
        ("Región de Tarapacá", 2.00),
        ("Región de Atacama", 1.62),
        ("Región de Arica y Parinacota", 1.32),
        ("Región de Magallanes y de la Antártica Chilena", 0.90),
        ("Región de Aysén del General Carlos Ibáñez del Campo", 0.55),
    ],
    # % nacidos en el extranjero por región = extranjeros residentes (EPE 2023
    # INE–SERMIG, Tabla 8) ÷ población de la región (Censo 2024). Media nacional
    # 9,91% (incluye 111.703 personas con región ignorada, no repartidas aquí).
    "foreign_share": {
        "Región de Tarapacá": 0.234, "Región de Antofagasta": 0.203,
        "Región de Arica y Parinacota": 0.151,
        "Región Metropolitana de Santiago": 0.147, "Región de Atacama": 0.091,
        "Región de Magallanes y de la Antártica Chilena": 0.073,
        "Región de Valparaíso": 0.065,
        "Región del Libertador General Bernardo O'Higgins": 0.061,
        "Región de Coquimbo": 0.059, "Región del Maule": 0.047,
        "Región de Aysén del General Carlos Ibáñez del Campo": 0.045,
        "Región de Los Lagos": 0.042, "Región del Biobío": 0.031,
        "Región de Ñuble": 0.028, "Región de La Araucanía": 0.025,
        "Región de Los Ríos": 0.024,
    },
    "foreign_share_default": 0.099,
    # Colectivos de extranjeros residentes, % del total (EPE 2023 INE–SERMIG).
    # Los 6 primeros son cifras oficiales exactas (suman 86,1%); el resto
    # (~14% "otros") son los principales colectivos siguientes, aproximados.
    "foreign_countries": [
        ("Venezuela", 38.0), ("Perú", 13.6), ("Colombia", 10.9), ("Haití", 9.8),
        ("Bolivia", 9.4), ("Argentina", 4.3), ("Ecuador", 1.5), ("China", 1.2),
        ("Brasil", 1.1), ("República Dominicana", 1.0), ("España", 0.9), ("Cuba", 0.8),
    ],
    "politica": [
        ("izquierda", 16), ("centro-izquierda", 20), ("centro", 18),
        ("centro-derecha", 20), ("derecha", 16), ("apolítico/abstencionista", 10),
    ],
    # Educación: (etiqueta_natural_para_el_LLM, categoría_canónica, peso).
    # Calibrado a la estructura educativa adulta de Chile (CASEN / OECD EAG:
    # educación terciaria ~30%). Las categorías canónicas coinciden con las
    # que el frontend usa para agrupar (EDU_ORDER). Bachillerato no aplica a
    # Chile (la enseñanza media va a "Secundaria").
    "educacion": [
        ("Postgrado (magíster o doctorado)",   "Postgrado (máster/doctorado)",                  3),
        ("Universitario (título profesional)", "Universitario (grado/diplomatura/FP superior)", 15),
        ("Técnico de nivel superior",          "Formación Profesional (grado medio)",           12),
        ("Enseñanza media completa",           "Secundaria (1ª etapa / ESO)",                   45),
        ("Enseñanza básica",                   "Primaria",                                      20),
        ("Sin estudios formales",              "Sin estudios",                                   5),
    ],
    # Clase de ingreso CONDICIONADA al nivel educativo (coherencia interna):
    # categoría canónica de educación -> [(clase_ingreso, peso)]. Las clases
    # coinciden con INC_ORDER del frontend (sin "Otros"). La marginal resultante
    # (≈ educación × condicional) reparte una desigualdad plausible para Chile.
    "ingresos_por_educacion": {
        "Postgrado (máster/doctorado)":                  [("Alto", 35), ("Medio-alto", 35), ("Medio", 25), ("Medio-bajo", 5), ("Bajo", 0)],
        "Universitario (grado/diplomatura/FP superior)": [("Alto", 15), ("Medio-alto", 30), ("Medio", 35), ("Medio-bajo", 15), ("Bajo", 5)],
        "Formación Profesional (grado medio)":           [("Alto", 3), ("Medio-alto", 12), ("Medio", 40), ("Medio-bajo", 30), ("Bajo", 15)],
        "Secundaria (1ª etapa / ESO)":                   [("Alto", 1), ("Medio-alto", 5), ("Medio", 30), ("Medio-bajo", 34), ("Bajo", 30)],
        "Primaria":                                      [("Alto", 0), ("Medio-alto", 2), ("Medio", 15), ("Medio-bajo", 33), ("Bajo", 50)],
        "Sin estudios":                                  [("Alto", 0), ("Medio-alto", 0), ("Medio", 8), ("Medio-bajo", 22), ("Bajo", 70)],
    },
    # Anclas de ingreso mensual líquido (CLP) por clase, para que el LLM genere
    # importes realistas coherentes con la clase social asignada al slot.
    "ingresos_anclas": {
        "Bajo":       "menos de $500.000 CLP al mes",
        "Medio-bajo": "entre $500.000 y $900.000 CLP al mes",
        "Medio":      "entre $900.000 y $1.800.000 CLP al mes",
        "Medio-alto": "entre $1.800.000 y $3.500.000 CLP al mes",
        "Alto":       "más de $3.500.000 CLP al mes",
    },
    "temas_pais": (
        "pensiones (AFP) y reforma previsional, delincuencia y seguridad ciudadana, "
        "inmigración, vivienda y arriendo, salud (Fonasa/Isapres y listas de espera), "
        "educación, costo de la vida, medio ambiente y agua, y tecnología/IA"
    ),
    "contexto_cultural": """Español de Chile (castellano chileno).
- MODISMOS Y MULETILLAS: "cachai", "po" (sí po, ya po), "al tiro", "fome",
  "bacán", "la raja", "weón/weá" (según registro y confianza), "pololo/polola",
  "carrete", "luca" (mil pesos), "once" (la merienda), "harto", "filete",
  "andar pato" (sin plata), "echar la talla". Voseo coloquial moderado
  ("¿cómo estai?"). Ajusta el grosor del lenguaje al perfil (alguien formal o
  mayor habla más neutro; un joven popular usa más jerga).
- MARCAS Y CADENAS: supermercados Jumbo, Líder, Santa Isabel, Tottus, Unimarc;
  multitiendas Falabella, Ripley, París; Sodimac, Easy; farmacias Cruz Verde,
  Salcobrand, Ahumada; bancos BancoEstado, Banco de Chile, Santander; bencina
  Copec, Shell; telecom Entel, Movistar, WOM; delivery PedidosYa, Uber, Rappi;
  el Metro de Santiago, la "micro" (bus), el Transantiago/Red.
- LUGARES Y VIDA COTIDIANA: la población/el barrio, la "pega" (trabajo), el
  paradero, la feria libre, el completo y la empanada, el mote con huesillo, el
  asado/parrilla, las Fiestas Patrias (18 de septiembre, fonda, cueca), ir a la
  playa (Viña, Reñaca), la cordillera, el "finde" largo.
- REFERENTES: TV (TVN, Mega, Canal 13, Chilevisión), fútbol (Colo-Colo,
  Universidad de Chile, la "Roja"), prensa (La Tercera, El Mercurio, BioBío),
  política chilena actual sin consignas de partido.
- DINERO: pesos chilenos ($, CLP); sueldos y precios en cifras realistas de
  Chile (sueldo mínimo, "lucas", UF para arriendos/créditos).""",
}


COUNTRIES: dict[str, dict] = {"ES": _ES, "CL": _CL}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_country(code: str | None) -> dict:
    """Configuración del país por código ISO-2 (case-insensitive).
    Cae a España si el código es desconocido o nulo."""
    if not code:
        return COUNTRIES[DEFAULT_COUNTRY]
    return COUNTRIES.get(code.strip().upper(), COUNTRIES[DEFAULT_COUNTRY])


def country_name(code: str | None) -> str:
    return get_country(code)["nombre"]


def regiones(code: str | None) -> list[tuple[str, float]]:
    return get_country(code)["regiones"]


def region_names(code: str | None) -> list[str]:
    return [r for r, _ in get_country(code)["regiones"]]


def pyramid_bands(code: str | None) -> list[tuple]:
    return get_country(code)["pyramid_bands"]


def cultural_context_block(code: str | None) -> str:
    """Bloque de instrucciones para que el LLM dé voz local al personaje.
    Se concatena al system prompt de focus groups, encuestas y generación."""
    c = get_country(code)
    return (
        f"CONTEXTO CULTURAL Y LINGÜÍSTICO ({c['nombre']}):\n"
        f"Esta persona vive en {c['nombre']}. Escribe con su voz local real, no en "
        f"un español neutro de manual. Usa de forma natural sus modismos, marcas, "
        f"lugares y referentes, y AMPLÍALOS con tu propio conocimiento de "
        f"{c['nombre']} (no te limites a esta lista). Adapta el grado de jerga al "
        f"perfil de la persona (edad, estudios, registro) y NUNCA caricaturices.\n"
        f"{c['contexto_cultural']}"
    )
