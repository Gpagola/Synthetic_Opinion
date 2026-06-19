from datetime import datetime

from pydantic import BaseModel, Field


class Sociodemografico(BaseModel):
    edad: int | None = None
    genero: str | None = None
    pais_origen: str | None = None
    pais_residencia: str | None = None
    region: str | None = None
    codigo_postal: str | None = None
    nivel_educativo: str | None = None
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
