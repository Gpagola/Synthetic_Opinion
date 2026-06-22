from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FocusGroup, FocusGroupMember, Persona, Question
from app.schemas.focus_group import (
    AskRequest,
    CandidateOut,
    FocusGroupCreate,
    FocusGroupListItem,
    FocusGroupOut,
    FocusGroupUpdate,
    MembersUpdate,
    MemberOut,
    QuestionOut,
    RecruitRequest,
    ReplaceRequest,
    StatusOut,
)
from app.services import recruiting
from app.services.focus_engine import answer_question, request_cancel

router = APIRouter(prefix="/focus-groups", tags=["focus-groups"])


def _to_out(fg: FocusGroup, db: Session) -> FocusGroupOut:
    members = []
    for m in fg.members:
        p = db.get(Persona, m.persona_id)
        members.append(MemberOut(persona_id=m.persona_id, nombre=p.nombre if p else "—"))
    return FocusGroupOut(
        id=fg.id,
        nombre=fg.nombre,
        descripcion=fg.descripcion,
        tema=fg.tema,
        idioma=fg.idioma,
        pais=fg.pais,
        estado=fg.estado,
        error_msg=fg.error_msg,
        created_at=fg.created_at,
        members=members,
        questions=[QuestionOut.model_validate(q) for q in fg.questions],
    )


@router.get("", response_model=list[FocusGroupListItem])
def list_focus_groups(db: Session = Depends(get_db)):
    return db.query(FocusGroup).order_by(FocusGroup.created_at.desc()).all()


@router.post("", response_model=FocusGroupOut, status_code=201)
def create_focus_group(payload: FocusGroupCreate, db: Session = Depends(get_db)):
    fg = FocusGroup(**payload.model_dump())
    db.add(fg)
    db.commit()
    db.refresh(fg)
    return _to_out(fg, db)


@router.get("/{fg_id}", response_model=FocusGroupOut)
def get_focus_group(fg_id: int, db: Session = Depends(get_db)):
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    return _to_out(fg, db)


@router.put("/{fg_id}", response_model=FocusGroupOut)
def update_focus_group(fg_id: int, payload: FocusGroupUpdate, db: Session = Depends(get_db)):
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(fg, key, value)
    db.commit()
    db.refresh(fg)
    return _to_out(fg, db)


@router.delete("/{fg_id}", status_code=204)
def delete_focus_group(fg_id: int, db: Session = Depends(get_db)):
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    db.delete(fg)
    db.commit()


@router.post("/{fg_id}/members", response_model=FocusGroupOut)
def set_members(fg_id: int, payload: MembersUpdate, db: Session = Depends(get_db)):
    """Define la lista completa de miembros (reemplaza la anterior)."""
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")

    db.query(FocusGroupMember).filter(FocusGroupMember.focus_group_id == fg_id).delete()
    for pid in dict.fromkeys(payload.persona_ids):  # dedup conservando orden
        if db.get(Persona, pid) is None:
            continue
        db.add(FocusGroupMember(focus_group_id=fg_id, persona_id=pid))
    db.commit()
    db.refresh(fg)
    return _to_out(fg, db)


def _active_personas(db: Session, pais: str | None = None) -> dict[int, Persona]:
    """Personas activas, opcionalmente acotadas al país del focus group."""
    query = db.query(Persona).filter(Persona.activo.is_(True))
    if pais:
        query = query.filter(Persona.pais == pais)
    return {p.id: p for p in query.all()}


def _candidate(p: Persona, motivo: str) -> CandidateOut:
    sd = p.sociodemografico or {}
    return CandidateOut(
        persona_id=p.id,
        nombre=p.nombre,
        edad=sd.get("edad"),
        pais_origen=sd.get("pais_origen"),
        pais_residencia=sd.get("pais_residencia"),
        ocupacion=sd.get("ocupacion"),
        tags=p.tags or [],
        motivo=motivo,
    )


@router.post("/{fg_id}/recruit", response_model=list[CandidateOut])
def recruit_candidates(fg_id: int, payload: RecruitRequest, db: Session = Depends(get_db)):
    """Propone candidatos de la biblioteca de Personas que encajan con el perfil
    descrito. No fija miembros: es una propuesta editable."""
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    personas = _active_personas(db, fg.pais)
    if not personas:
        raise HTTPException(status_code=400, detail="No hay personas en la biblioteca")
    try:
        seleccion = recruiting.recruit(
            payload.perfil, payload.cantidad, list(personas.values()), fg.pais
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Error en el recruiting: {exc}")

    out: list[CandidateOut] = []
    vistos: set[int] = set()
    for item in seleccion:
        pid = item.get("persona_id")
        if pid in personas and pid not in vistos:
            out.append(_candidate(personas[pid], item.get("motivo", "")))
            vistos.add(pid)
    return out


@router.post("/{fg_id}/recruit/replace", response_model=CandidateOut)
def recruit_replace(fg_id: int, payload: ReplaceRequest, db: Session = Depends(get_db)):
    """Sugiere una persona alternativa que encaje, distinta de exclude_ids."""
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    personas = _active_personas(db, fg.pais)
    try:
        alt = recruiting.find_replacement(
            payload.perfil, list(personas.values()), payload.exclude_ids, fg.pais
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Error en el recruiting: {exc}")
    pid = alt.get("persona_id") if alt else None
    if not pid or pid not in personas:
        raise HTTPException(status_code=404, detail="No hay más candidatos disponibles que encajen")
    return _candidate(personas[pid], alt.get("motivo", ""))


@router.post("/{fg_id}/ask", response_model=StatusOut)
def ask(
    fg_id: int,
    payload: AskRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Mensaje del moderador en el chat: crea el turno y genera las respuestas
    de los destinatarios en segundo plano (con todo el contexto previo)."""
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    if not fg.members:
        raise HTTPException(status_code=400, detail="El focus group no tiene miembros")
    if not payload.texto.strip():
        raise HTTPException(status_code=400, detail="La pregunta no puede estar vacía")
    if fg.estado == "running":
        raise HTTPException(
            status_code=409, detail="Las personas aún están respondiendo el turno anterior"
        )

    # Valida destinatarios contra los miembros actuales
    member_ids = {m.persona_id for m in fg.members}
    dest = [pid for pid in dict.fromkeys(payload.destinatarios_ids) if pid in member_ids]

    siguiente_orden = (
        db.query(func.coalesce(func.max(Question.orden), -1))
        .filter(Question.focus_group_id == fg_id)
        .scalar()
        + 1
    )
    question = Question(
        focus_group_id=fg_id,
        texto=payload.texto.strip(),
        tipo="uno_a_uno" if len(dest) == 1 else "general",
        destinatarios=dest,
        orden=siguiente_orden,
    )
    db.add(question)
    fg.estado = "running"
    fg.error_msg = None
    db.commit()

    background_tasks.add_task(answer_question, fg_id, question.id)
    return StatusOut(estado="running", questions=[])


@router.post("/{fg_id}/cancel", response_model=StatusOut)
def cancel(fg_id: int, db: Session = Depends(get_db)):
    """Interrumpe la generación en curso: el moderador detiene las respuestas
    restantes del turno (se conservan las ya generadas)."""
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    request_cancel(fg_id)
    return StatusOut(estado=fg.estado, error_msg=fg.error_msg, questions=fg.questions)


@router.get("/{fg_id}/status", response_model=StatusOut)
def status(fg_id: int, db: Session = Depends(get_db)):
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    return StatusOut(estado=fg.estado, error_msg=fg.error_msg, questions=fg.questions)
