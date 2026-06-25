from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Sociodemografico(BaseModel):
    # extra="allow": conserva y expone por la API cualquier clave adicional del
    # JSON (los 8 sub-objetos de enriquecimiento: hogar_familia, vehiculos, banca,
    # seguros, telecom, digital, laboral, consumo_habitos, y la marca `enriquecido`),
    # sin tener que declararlas una a una. Evita el bug de "claves descartadas".
    model_config = ConfigDict(extra="allow")

    edad: int | None = None
    genero: str | None = None
    pais_origen: str | None = None
    pais_residencia: str | None = None
    region: str | None = None
    codigo_postal: str | None = None
    nivel_educativo: str | None = None
    # Categoría canónica de educación y clase de ingreso (seed calibrado, p.ej.
    # Chile). Alimentan las estadísticas del frontend; el resto de países las
    # dejan a None y el front cae a la normalización por texto libre.
    nivel_educativo_cat: str | None = None
    nivel_ingresos: str | None = None
    ingresos: str | None = None
    ocupacion: str | None = None
    estado_civil: str | None = None
    hogar: str | None = None


class Consumidor(BaseModel):
    categorias_interes: list[str] = Field(default_factory=list)
    marcas: list[str] = Field(default_factory=list)
    habitos_gasto: str | None = None
    canales: list[str] = Field(default_factory=list)
    sensibilidad_precio: str | None = None


class Opinion(BaseModel):
    valores_vida: list[str] = Field(default_factory=list)
    actitudes: list[str] = Field(default_factory=list)
    rasgos_personalidad: list[str] = Field(default_factory=list)
    posicionamientos: str | None = None


class PersonaBase(BaseModel):
    nombre: str
    idioma: str = "es"
    pais: str = "ES"  # código ISO-2: ES | CL
    tags: list[str] = Field(default_factory=list)
    sociodemografico: Sociodemografico = Field(default_factory=Sociodemografico)
    consumidor: Consumidor = Field(default_factory=Consumidor)
    opinion: Opinion = Field(default_factory=Opinion)
    bio: str = ""


class PersonaCreate(PersonaBase):
    origen: str = "manual"


class PersonaUpdate(BaseModel):
    nombre: str | None = None
    idioma: str | None = None
    pais: str | None = None
    tags: list[str] | None = None
    sociodemografico: Sociodemografico | None = None
    consumidor: Consumidor | None = None
    opinion: Opinion | None = None
    bio: str | None = None


class PersonaOut(PersonaBase):
    id: int
    origen: str
    activo: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateParams(BaseModel):
    """Parámetros para la generación de personas con IA."""

    cantidad: int = Field(default=3, ge=1, le=20)
    pais: str | None = None
    region: str | None = None
    edad_min: int | None = Field(default=None, ge=0, le=120)
    edad_max: int | None = Field(default=None, ge=0, le=120)
    segmento: str | None = None
    idioma: str = "es"
    instrucciones: str | None = None
