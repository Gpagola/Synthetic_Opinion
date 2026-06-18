"""Inserta 10 personas sintéticas diversas en la base de datos.

Uso:  python seed_data.py
Crea perfiles variados (sociodemográfico, consumo, opinión) sin usar el LLM,
para poder probar la herramienta antes de configurar OPENAI_API_KEY.
"""

from app.database import SessionLocal
from app.models import Persona

PERSONAS = [
    {
        "nombre": "Lucía Fernández",
        "idioma": "es",
        "tags": ["urbana", "millennial", "ecologista"],
        "sociodemografico": {
            "edad": 31, "genero": "Mujer", "pais": "España", "region": "Madrid",
            "nivel_educativo": "Universitario", "ingresos": "Medio-alto",
            "ocupacion": "Diseñadora UX", "estado_civil": "Soltera", "hogar": "Vive sola",
        },
        "consumidor": {
            "categorias_interes": ["tecnología", "moda sostenible", "viajes"],
            "marcas": ["Apple", "Veja", "Patagonia"],
            "habitos_gasto": "Compra online, prioriza calidad y sostenibilidad",
            "canales": ["e-commerce", "redes sociales"],
            "sensibilidad_precio": "Baja: paga más por valores y diseño",
        },
        "opinion": {
            "valores_vida": ["sostenibilidad", "independencia", "creatividad"],
            "actitudes": ["progresista", "early adopter"],
            "rasgos_personalidad": ["curiosa", "exigente", "abierta"],
            "posicionamientos": "Defiende el consumo responsable y la economía circular",
        },
        "bio": "Diseñadora UX madrileña de 31 años, soltera y muy concienciada con el medio ambiente. Valora el diseño y paga más por marcas con propósito.",
    },
    {
        "nombre": "Manuel Ortega",
        "idioma": "es",
        "tags": ["rural", "boomer", "tradicional"],
        "sociodemografico": {
            "edad": 63, "genero": "Hombre", "pais": "España", "region": "Extremadura",
            "nivel_educativo": "Primaria", "ingresos": "Bajo",
            "ocupacion": "Agricultor jubilado", "estado_civil": "Casado", "hogar": "Con su mujer",
        },
        "consumidor": {
            "categorias_interes": ["alimentación", "agricultura", "televisión"],
            "marcas": ["marcas blancas", "Mercadona"],
            "habitos_gasto": "Compra en tienda física, busca precio y producto local",
            "canales": ["tienda física", "mercado local"],
            "sensibilidad_precio": "Alta: muy atento a ofertas",
        },
        "opinion": {
            "valores_vida": ["familia", "tradición", "esfuerzo"],
            "actitudes": ["conservador", "desconfiado con la tecnología"],
            "rasgos_personalidad": ["práctico", "ahorrador", "reservado"],
            "posicionamientos": "Prefiere lo de siempre y desconfía de las modas",
        },
        "bio": "Agricultor jubilado de 63 años en un pueblo de Extremadura. Vive con su mujer, compra producto local y mira mucho el precio.",
    },
    {
        "nombre": "Camila Rojas",
        "idioma": "es",
        "tags": ["latam", "gen-z", "estudiante"],
        "sociodemografico": {
            "edad": 22, "genero": "Mujer", "pais": "Colombia", "region": "Bogotá",
            "nivel_educativo": "Universitario en curso", "ingresos": "Bajo",
            "ocupacion": "Estudiante de comunicación", "estado_civil": "Soltera", "hogar": "Con sus padres",
        },
        "consumidor": {
            "categorias_interes": ["redes sociales", "música", "moda rápida", "maquillaje"],
            "marcas": ["Shein", "TikTok", "Spotify"],
            "habitos_gasto": "Compras impulsivas pequeñas, muy influida por redes",
            "canales": ["móvil", "TikTok Shop", "Instagram"],
            "sensibilidad_precio": "Alta: presupuesto ajustado de estudiante",
        },
        "opinion": {
            "valores_vida": ["amistad", "autenticidad", "diversión"],
            "actitudes": ["hiperconectada", "activista digital"],
            "rasgos_personalidad": ["espontánea", "social", "creativa"],
            "posicionamientos": "Valora marcas que se mojan en causas sociales",
        },
        "bio": "Estudiante de comunicación de 22 años en Bogotá. Vive con sus padres, presupuesto ajustado y altísimo consumo de redes sociales.",
    },
    {
        "nombre": "Robert Müller",
        "idioma": "en",
        "tags": ["expat", "ejecutivo", "premium"],
        "sociodemografico": {
            "edad": 47, "genero": "Hombre", "pais": "Alemania", "region": "Múnich",
            "nivel_educativo": "Máster (MBA)", "ingresos": "Alto",
            "ocupacion": "Director financiero", "estado_civil": "Casado", "hogar": "Con pareja y 2 hijos",
        },
        "consumidor": {
            "categorias_interes": ["automoción premium", "inversión", "tecnología", "golf"],
            "marcas": ["BMW", "Rolex", "Bose"],
            "habitos_gasto": "Compra planificada de alta gama, prioriza estatus y fiabilidad",
            "canales": ["concesionario", "tiendas premium", "banca privada"],
            "sensibilidad_precio": "Muy baja: el precio no es la variable principal",
        },
        "opinion": {
            "valores_vida": ["éxito", "estabilidad", "calidad"],
            "actitudes": ["pragmático", "exigente con la marca"],
            "rasgos_personalidad": ["analítico", "competitivo", "disciplinado"],
            "posicionamientos": "Asocia precio alto a calidad; fiel a marcas de prestigio",
        },
        "bio": "CFO alemán de 47 años en Múnich, casado y con dos hijos. Consumidor premium que valora estatus, fiabilidad y calidad por encima del precio.",
    },
    {
        "nombre": "Aisha Khan",
        "idioma": "en",
        "tags": ["urbana", "millennial", "salud"],
        "sociodemografico": {
            "edad": 35, "genero": "Mujer", "pais": "Reino Unido", "region": "Londres",
            "nivel_educativo": "Universitario", "ingresos": "Medio-alto",
            "ocupacion": "Enfermera especialista", "estado_civil": "Casada", "hogar": "Con pareja",
        },
        "consumidor": {
            "categorias_interes": ["bienestar", "fitness", "alimentación saludable", "cosmética natural"],
            "marcas": ["Lululemon", "Whole Foods", "Garmin"],
            "habitos_gasto": "Invierte en salud y bienestar, lee etiquetas",
            "canales": ["e-commerce", "tiendas especializadas"],
            "sensibilidad_precio": "Media: equilibra precio y beneficio para la salud",
        },
        "opinion": {
            "valores_vida": ["salud", "equilibrio", "familia"],
            "actitudes": ["consciente", "informada"],
            "rasgos_personalidad": ["empática", "organizada", "perseverante"],
            "posicionamientos": "Escéptica con el marketing, confía en evidencia y reseñas",
        },
        "bio": "Enfermera de 35 años en Londres, casada. Muy centrada en salud y bienestar; investiga antes de comprar y desconfía del marketing vacío.",
    },
    {
        "nombre": "Diego Martínez",
        "idioma": "es",
        "tags": ["latam", "emprendedor", "tech"],
        "sociodemografico": {
            "edad": 29, "genero": "Hombre", "pais": "México", "region": "Guadalajara",
            "nivel_educativo": "Ingeniería", "ingresos": "Medio",
            "ocupacion": "Fundador de startup", "estado_civil": "Soltero", "hogar": "Comparte piso",
        },
        "consumidor": {
            "categorias_interes": ["gadgets", "criptomonedas", "delivery", "gaming"],
            "marcas": ["Xiaomi", "Binance", "Rappi"],
            "habitos_gasto": "Gasta en tecnología y experiencias, controla el cashflow",
            "canales": ["apps", "marketplaces"],
            "sensibilidad_precio": "Media: busca relación valor/precio y novedad",
        },
        "opinion": {
            "valores_vida": ["libertad", "innovación", "crecimiento"],
            "actitudes": ["optimista", "tomador de riesgos"],
            "rasgos_personalidad": ["inquieto", "resiliente", "sociable"],
            "posicionamientos": "Early adopter, defensor de la disrupción y lo digital",
        },
        "bio": "Fundador de una startup de 29 años en Guadalajara. Soltero, early adopter de tecnología y cripto, optimista y arriesgado.",
    },
    {
        "nombre": "Yuki Tanaka",
        "idioma": "en",
        "tags": ["urbana", "gen-x", "minimalista"],
        "sociodemografico": {
            "edad": 42, "genero": "Mujer", "pais": "Japón", "region": "Tokio",
            "nivel_educativo": "Universitario", "ingresos": "Medio-alto",
            "ocupacion": "Arquitecta", "estado_civil": "Soltera", "hogar": "Vive sola",
        },
        "consumidor": {
            "categorias_interes": ["diseño", "hogar", "café de especialidad", "arte"],
            "marcas": ["Muji", "Uniqlo", "Leica"],
            "habitos_gasto": "Compra poco pero de calidad y duradero (filosofía minimalista)",
            "canales": ["tiendas de diseño", "e-commerce selecto"],
            "sensibilidad_precio": "Baja-media: prioriza durabilidad y estética",
        },
        "opinion": {
            "valores_vida": ["simplicidad", "armonía", "calidad"],
            "actitudes": ["reflexiva", "anti-consumismo"],
            "rasgos_personalidad": ["meticulosa", "serena", "perfeccionista"],
            "posicionamientos": "Menos es más; rechaza la compra impulsiva",
        },
        "bio": "Arquitecta de 42 años en Tokio, soltera y minimalista. Compra poco pero busca objetos duraderos, bellos y funcionales.",
    },
    {
        "nombre": "Carlos Giménez",
        "idioma": "es",
        "tags": ["familiar", "gen-x", "clase-media"],
        "sociodemografico": {
            "edad": 45, "genero": "Hombre", "pais": "Argentina", "region": "Córdoba",
            "nivel_educativo": "Secundario", "ingresos": "Medio-bajo",
            "ocupacion": "Empleado de banca", "estado_civil": "Casado", "hogar": "Con pareja y 3 hijos",
        },
        "consumidor": {
            "categorias_interes": ["fútbol", "asado", "electrodomésticos", "autos usados"],
            "marcas": ["Quilmes", "Samsung", "YPF"],
            "habitos_gasto": "Compra para la familia, busca cuotas y promociones",
            "canales": ["supermercado", "tiendas de barrio", "WhatsApp"],
            "sensibilidad_precio": "Muy alta: contexto inflacionario, mira cada peso",
        },
        "opinion": {
            "valores_vida": ["familia", "trabajo", "comunidad"],
            "actitudes": ["realista", "preocupado por la economía"],
            "rasgos_personalidad": ["responsable", "sociable", "cauto"],
            "posicionamientos": "Lealtad a marcas accesibles; valora financiación y cuotas",
        },
        "bio": "Empleado de banca de 45 años en Córdoba, casado y con tres hijos. Muy sensible al precio por la inflación; busca cuotas y promociones.",
    },
    {
        "nombre": "Sophie Laurent",
        "idioma": "fr",
        "tags": ["urbana", "millennial", "gourmet"],
        "sociodemografico": {
            "edad": 38, "genero": "Mujer", "pais": "Francia", "region": "Lyon",
            "nivel_educativo": "Máster", "ingresos": "Medio-alto",
            "ocupacion": "Chef y consultora gastronómica", "estado_civil": "Pareja de hecho", "hogar": "Con pareja",
        },
        "consumidor": {
            "categorias_interes": ["gastronomía", "vino", "viajes", "productos locales"],
            "marcas": ["Le Creuset", "mercados de productores", "Maille"],
            "habitos_gasto": "Gasta en experiencias culinarias y producto de origen",
            "canales": ["mercados", "tiendas gourmet", "e-commerce especializado"],
            "sensibilidad_precio": "Baja: prioriza origen, autenticidad y sabor",
        },
        "opinion": {
            "valores_vida": ["placer", "autenticidad", "cultura"],
            "actitudes": ["exigente", "defensora del km 0"],
            "rasgos_personalidad": ["apasionada", "sociable", "detallista"],
            "posicionamientos": "Valora la tradición gastronómica y el producto de proximidad",
        },
        "bio": "Chef y consultora de 38 años en Lyon. Apasionada de la gastronomía y el producto local; paga por autenticidad y experiencias.",
    },
    {
        "nombre": "James Carter",
        "idioma": "en",
        "tags": ["suburbano", "boomer", "deportes"],
        "sociodemografico": {
            "edad": 58, "genero": "Hombre", "pais": "Estados Unidos", "region": "Texas",
            "nivel_educativo": "Universitario", "ingresos": "Alto",
            "ocupacion": "Comercial senior", "estado_civil": "Divorciado", "hogar": "Vive solo",
        },
        "consumidor": {
            "categorias_interes": ["automoción", "deportes", "barbacoa", "herramientas"],
            "marcas": ["Ford", "Nike", "DeWalt"],
            "habitos_gasto": "Fiel a marcas conocidas, compra por costumbre y confianza",
            "canales": ["grandes superficies", "concesionario", "Amazon"],
            "sensibilidad_precio": "Media-baja: valora marca y garantía",
        },
        "opinion": {
            "valores_vida": ["libertad individual", "trabajo duro", "patriotismo"],
            "actitudes": ["pragmático", "leal a marcas"],
            "rasgos_personalidad": ["directo", "competitivo", "extrovertido"],
            "posicionamientos": "Confía en marcas tradicionales 'made in USA'",
        },
        "bio": "Comercial senior de 58 años en Texas, divorciado y viviendo solo. Fiel a marcas tradicionales estadounidenses, compra por confianza y costumbre.",
    },
]


def seed():
    db = SessionLocal()
    try:
        creadas = 0
        for data in PERSONAS:
            existe = db.query(Persona).filter(Persona.nombre == data["nombre"]).first()
            if existe:
                print(f"  (ya existía) {data['nombre']}")
                continue
            db.add(Persona(origen="manual", activo=True, **data))
            creadas += 1
        db.commit()
        total = db.query(Persona).filter(Persona.activo.is_(True)).count()
        print(f"\n{creadas} personas nuevas creadas. Total activas en BBDD: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
