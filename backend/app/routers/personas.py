from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Persona
from app.schemas.persona import (
    GenerateParams,
    PersonaBase,
    PersonaCreate,
    PersonaOut,
    PersonaUpdate,
)
from app.services.persona_gen import generate_personas

router = APIRouter(prefix="/personas", tags=["personas"])


@router.post("/generate", response_model=list[PersonaBase])
def generate(params: GenerateParams):
    """Genera borradores de personas con IA (NO se guardan)."""
    try:
        return generate_personas(params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Error generando personas: {exc}")


@router.get("", response_model=list[PersonaOut])
def list_personas(
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, description="Busca en nombre"),
    pais: str | None = None,
    incluir_inactivas: bool = False,
):
    query = db.query(Persona)
    if not incluir_inactivas:
        query = query.filter(Persona.activo.is_(True))
    if q:
        query = query.filter(Persona.nombre.like(f"%{q}%"))
    personas = query.order_by(Persona.created_at.desc()).all()
    if pais:
        personas = [
            p
            for p in personas
            if pais in (
                (p.sociodemografico or {}).get("pais_residencia"),
                (p.sociodemografico or {}).get("pais_origen"),
            )
        ]
    return personas


@router.post("", response_model=PersonaOut, status_code=201)
def create_persona(payload: PersonaCreate, db: Session = Depends(get_db)):
    persona = Persona(
        nombre=payload.nombre,
        idioma=payload.idioma,
        origen=payload.origen,
        tags=payload.tags,
        sociodemografico=payload.sociodemografico.model_dump(),
        consumidor=payload.consumidor.model_dump(),
        opinion=payload.opinion.model_dump(),
        bio=payload.bio,
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


@router.get("/{persona_id}", response_model=PersonaOut)
def get_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    return persona


@router.put("/{persona_id}", response_model=PersonaOut)
def update_persona(persona_id: int, payload: PersonaUpdate, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    data = payload.model_dump(exclude_unset=True)
    for field in ("sociodemografico", "consumidor", "opinion"):
        if field in data and data[field] is not None:
            setattr(persona, field, data.pop(field))
    for key, value in data.items():
        setattr(persona, key, value)

    db.commit()
    db.refresh(persona)
    return persona


@router.delete("/{persona_id}", status_code=204)
def delete_persona(persona_id: int, db: Session = Depends(get_db)):
    """Soft-delete: la persona deja de aparecer en selectores pero se conservan
    sus respuestas e informes previos."""
    persona = db.get(Persona, persona_id)
    if persona is None:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    persona.activo = False
    db.commit()
