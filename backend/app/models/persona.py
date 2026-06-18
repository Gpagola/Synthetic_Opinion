from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Persona(Base):
    """Persona sintética. Entidad de primer nivel: biblioteca reutilizable,
    independiente de cualquier focus group."""

    __tablename__ = "persona"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    idioma: Mapped[str] = mapped_column(String(10), default="es", nullable=False)
    origen: Mapped[str] = mapped_column(String(20), default="ai", nullable=False)  # ai | manual
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Listas/objetos guardados como JSON (MySQL JSON)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    sociodemografico: Mapped[dict] = mapped_column(JSON, default=dict)
    consumidor: Mapped[dict] = mapped_column(JSON, default=dict)
    opinion: Mapped[dict] = mapped_column(JSON, default=dict)
    bio: Mapped[str] = mapped_column(String(2000), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
