from datetime import datetime

from pydantic import BaseModel, Field


class ConditionRule(BaseModel):
    """Regla de salto: si la respuesta coincide con si_respuesta, ir a ir_a_orden.
    ir_a_orden=None significa terminar la encuesta para esa persona."""
    si_respuesta: str
    ir_a_orden: int | None = None


class QuestionIn(BaseModel):
    texto: str
    tipo: str  # single | multiple | yesno | likert | nps | abierta
    opciones: list[str] = Field(default_factory=list)
    obligatoria: bool = True
    condiciones: list[ConditionRule] = Field(default_factory=list)


class QuestionsUpdate(BaseModel):
    questions: list[QuestionIn]


class QuestionOut(BaseModel):
    id: int
    texto: str
    tipo: str
    opciones: list[str] = Field(default_factory=list)
    orden: int
    obligatoria: bool
    condiciones: list[ConditionRule] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SurveyCreate(BaseModel):
    nombre: str
    tema: str = ""
    descripcion: str = ""
    idioma: str = "es"
    pais: str = "ES"  # código ISO-2: ES | CL


class SurveyListItem(BaseModel):
    id: int
    nombre: str
    tema: str
    idioma: str
    pais: str = "ES"
    estado: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SurveyOut(SurveyListItem):
    descripcion: str = ""
    modelo: str = "gpt-4o"
    reasoning_effort: str | None = None
    error_msg: str | None = None
    questions: list[QuestionOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class LaunchRequest(BaseModel):
    persona_ids: list[int]
    modelo: str = "gpt-4o"
    reasoning_effort: str | None = None


class StatusOut(BaseModel):
    estado: str
    total: int
    respondidas: int
    error_msg: str | None = None


class OptionStat(BaseModel):
    opcion: str
    n: int
    pct: float


class QuestionResult(BaseModel):
    question_id: int
    texto: str
    tipo: str
    n: int
    distribucion: list[OptionStat] = Field(default_factory=list)
    media: float | None = None  # likert / nps
    nps: float | None = None    # solo nps
    # crosstab: {valor_segmento: [OptionStat,...]}
    cruce: dict[str, list[OptionStat]] = Field(default_factory=dict)
    textos: list[str] = Field(default_factory=list)  # verbatims (preguntas abiertas)


class ResultsOut(BaseModel):
    estado: str
    total_respuestas: int
    break_var: str | None = None
    preguntas: list[QuestionResult] = Field(default_factory=list)


class SurveyImportDraft(BaseModel):
    """Resultado del importador PDF/Word: cuestionario parseado, sin guardar en BD."""
    nombre: str
    tema: str = ""
    preguntas: list[QuestionIn]
