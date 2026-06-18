from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FocusGroup(Base):
    __tablename__ = "focus_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, default="")
    tema: Mapped[str] = mapped_column(String(500), default="")
    idioma: Mapped[str] = mapped_column(String(10), default="es", nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    # draft | running | completed | error
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    members: Mapped[list["FocusGroupMember"]] = relationship(
        back_populates="focus_group", cascade="all, delete-orphan"
    )
    questions: Mapped[list["Question"]] = relationship(
        back_populates="focus_group",
        cascade="all, delete-orphan",
        order_by="Question.orden",
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="focus_group", cascade="all, delete-orphan"
    )


class FocusGroupMember(Base):
    """Relación N:M entre focus group y personas de la biblioteca.
    El focus solo referencia a la persona, no la copia."""

    __tablename__ = "focus_group_member"
    __table_args__ = (
        UniqueConstraint("focus_group_id", "persona_id", name="uq_fg_persona"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    focus_group_id: Mapped[int] = mapped_column(
        ForeignKey("focus_group.id", ondelete="CASCADE"), nullable=False
    )
    persona_id: Mapped[int] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )

    focus_group: Mapped["FocusGroup"] = relationship(back_populates="members")
    persona: Mapped["Persona"] = relationship()  # noqa: F821


class Question(Base):
    __tablename__ = "question"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    focus_group_id: Mapped[int] = mapped_column(
        ForeignKey("focus_group.id", ondelete="CASCADE"), nullable=False
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="general", nullable=False)
    # general | uno_a_uno  (obsoleto: se conserva por compatibilidad)
    persona_objetivo_id: Mapped[int | None] = mapped_column(
        ForeignKey("persona.id", ondelete="SET NULL"), nullable=True
    )
    # Destinatarios del mensaje del moderador (lista de persona_id).
    # Vacío/null = a todos los miembros del focus group.
    destinatarios: Mapped[list] = mapped_column(JSON, default=list)
    orden: Mapped[int] = mapped_column(Integer, default=0)

    focus_group: Mapped["FocusGroup"] = relationship(back_populates="questions")
    responses: Mapped[list["Response"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class Response(Base):
    __tablename__ = "response"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("question.id", ondelete="CASCADE"), nullable=False
    )
    persona_id: Mapped[int] = mapped_column(
        ForeignKey("persona.id", ondelete="CASCADE"), nullable=False
    )
    persona_nombre: Mapped[str] = mapped_column(String(255), default="")
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    orden: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    question: Mapped["Question"] = relationship(back_populates="responses")


class Report(Base):
    __tablename__ = "report"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    focus_group_id: Mapped[int] = mapped_column(
        ForeignKey("focus_group.id", ondelete="CASCADE"), nullable=False
    )
    contenido_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    metadatos: Mapped[dict] = mapped_column(JSON, default=dict)

    generated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    focus_group: Mapped["FocusGroup"] = relationship(back_populates="reports")
