from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Survey(Base):
    __tablename__ = "survey"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    tema: Mapped[str] = mapped_column(String(500), default="")
    descripcion: Mapped[str] = mapped_column(Text, default="")
    idioma: Mapped[str] = mapped_column(String(10), default="es", nullable=False)
    pais: Mapped[str] = mapped_column(String(2), default="ES", nullable=False)  # ISO-2: ES | CL
    estado: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    # draft | running | completed | error
    modelo: Mapped[str] = mapped_column(String(60), default="gpt-4o")
    reasoning_effort: Mapped[str | None] = mapped_column(String(20), nullable=True)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    questions: Mapped[list["SurveyQuestion"]] = relationship(
        back_populates="survey", cascade="all, delete-orphan", order_by="SurveyQuestion.orden"
    )
    responses: Mapped[list["SurveyResponse"]] = relationship(
        back_populates="survey", cascade="all, delete-orphan"
    )


class SurveyQuestion(Base):
    __tablename__ = "survey_question"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("survey.id", ondelete="CASCADE"), nullable=False
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    # single | multiple | yesno | likert | nps
    opciones: Mapped[list] = mapped_column(JSON, default=list)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    obligatoria: Mapped[bool] = mapped_column(Boolean, default=True)

    survey: Mapped["Survey"] = relationship(back_populates="questions")


class SurveyResponse(Base):
    __tablename__ = "survey_response"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    survey_id: Mapped[int] = mapped_column(
        ForeignKey("survey.id", ondelete="CASCADE"), nullable=False
    )
    persona_id: Mapped[int] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    # Snapshot de variables de segmentación para cruces rápidos
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    # {question_id: valor}  (valor = str | list[str] | int)
    respuestas: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    survey: Mapped["Survey"] = relationship(back_populates="responses")
