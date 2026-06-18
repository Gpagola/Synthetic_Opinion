from datetime import datetime

from pydantic import BaseModel, Field


class FocusGroupBase(BaseModel):
    nombre: str
    descripcion: str = ""
    tema: str = ""
    idioma: str = "es"


class FocusGroupCreate(FocusGroupBase):
    pass


class FocusGroupUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    tema: str | None = None
    idioma: str | None = None


class MembersUpdate(BaseModel):
    persona_ids: list[int]


class AskRequest(BaseModel):
    """Un mensaje del moderador en el chat del focus group."""

    texto: str
    # Destinatarios (persona_id). Vacío = a todos los miembros.
    destinatarios_ids: list[int] = Field(default_factory=list)


class RecruitRequest(BaseModel):
    """Recruiting: perfil de público objetivo en texto libre + cantidad."""

    perfil: str
    cantidad: int = Field(default=6, ge=1, le=30)


class ReplaceRequest(BaseModel):
    """Pide una persona alternativa, excluyendo las ya propuestas/descartadas."""

    perfil: str
    exclude_ids: list[int] = Field(default_factory=list)


class CandidateOut(BaseModel):
    persona_id: int
    nombre: str
    edad: int | None = None
    pais_origen: str | None = None
    pais_residencia: str | None = None
    ocupacion: str | None = None
    tags: list[str] = Field(default_factory=list)
    motivo: str = ""


class ResponseOut(BaseModel):
    id: int
    question_id: int
    persona_id: int
    persona_nombre: str
    texto: str
    orden: int
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionOut(BaseModel):
    id: int
    texto: str
    tipo: str
    persona_objetivo_id: int | None
    destinatarios: list[int] = Field(default_factory=list)
    orden: int
    responses: list[ResponseOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class MemberOut(BaseModel):
    persona_id: int
    nombre: str


class FocusGroupOut(FocusGroupBase):
    id: int
    estado: str
    error_msg: str | None = None
    created_at: datetime
    members: list[MemberOut] = Field(default_factory=list)
    questions: list[QuestionOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class FocusGroupListItem(FocusGroupBase):
    id: int
    estado: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StatusOut(BaseModel):
    estado: str
    error_msg: str | None = None
    questions: list[QuestionOut] = Field(default_factory=list)


class ReportOut(BaseModel):
    id: int
    focus_group_id: int
    contenido_markdown: str
    metadatos: dict
    generated_at: datetime

    model_config = {"from_attributes": True}
