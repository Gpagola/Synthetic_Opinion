from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Survey, SurveyQuestion, SurveyResponse
from app.schemas.survey import (
    LaunchRequest,
    QuestionsUpdate,
    StatusOut,
    SurveyCreate,
    SurveyListItem,
    SurveyOut,
)
from app.services import survey_engine

router = APIRouter(prefix="/surveys", tags=["surveys"])


def _get(db: Session, sid: int) -> Survey:
    s = db.get(Survey, sid)
    if s is None:
        raise HTTPException(status_code=404, detail="Encuesta no encontrada")
    return s


@router.get("", response_model=list[SurveyListItem])
def list_surveys(db: Session = Depends(get_db)):
    return db.query(Survey).order_by(Survey.created_at.desc()).all()


@router.post("", response_model=SurveyOut, status_code=201)
def create_survey(payload: SurveyCreate, db: Session = Depends(get_db)):
    s = Survey(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/{sid}", response_model=SurveyOut)
def get_survey(sid: int, db: Session = Depends(get_db)):
    return _get(db, sid)


@router.delete("/{sid}", status_code=204)
def delete_survey(sid: int, db: Session = Depends(get_db)):
    db.delete(_get(db, sid))
    db.commit()


@router.post("/{sid}/questions", response_model=SurveyOut)
def set_questions(sid: int, payload: QuestionsUpdate, db: Session = Depends(get_db)):
    s = _get(db, sid)
    db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == sid).delete()
    for i, q in enumerate(payload.questions):
        db.add(SurveyQuestion(
            survey_id=sid, texto=q.texto, tipo=q.tipo,
            opciones=q.opciones, orden=i, obligatoria=q.obligatoria,
        ))
    db.commit()
    db.refresh(s)
    return s


@router.post("/{sid}/launch", response_model=StatusOut)
def launch(sid: int, payload: LaunchRequest, background_tasks: BackgroundTasks,
           db: Session = Depends(get_db)):
    s = _get(db, sid)
    if not s.questions:
        raise HTTPException(status_code=400, detail="La encuesta no tiene preguntas")
    if not payload.persona_ids:
        raise HTTPException(status_code=400, detail="No hay muestra seleccionada")
    if s.estado == "running":
        raise HTTPException(status_code=409, detail="La encuesta ya se está ejecutando")
    s.estado = "running"
    s.error_msg = None
    db.commit()
    background_tasks.add_task(
        survey_engine.answer_survey, sid, payload.persona_ids,
        payload.modelo, payload.reasoning_effort,
    )
    return StatusOut(estado="running", total=len(payload.persona_ids), respondidas=0)


@router.get("/{sid}/status", response_model=StatusOut)
def status(sid: int, db: Session = Depends(get_db)):
    s = _get(db, sid)
    n = db.query(SurveyResponse).filter(SurveyResponse.survey_id == sid).count()
    return StatusOut(estado=s.estado, total=n, respondidas=n, error_msg=s.error_msg)


@router.get("/{sid}/results")
def results(sid: int, break_var: str | None = None, db: Session = Depends(get_db)):
    return survey_engine.compute_results(db, _get(db, sid), break_var)


@router.get("/{sid}/export")
def export(sid: int, db: Session = Depends(get_db)):
    s = _get(db, sid)
    content = survey_engine.export_xlsx(db, s)
    return FastAPIResponse(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="encuesta_{sid}.xlsx"'},
    )
