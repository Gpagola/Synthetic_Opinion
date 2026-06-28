import io

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Survey, SurveyQuestion, SurveyResponse
from app.schemas.survey import (
    LaunchRequest,
    QuestionsUpdate,
    StatusOut,
    SurveyCreate,
    SurveyImportDraft,
    SurveyListItem,
    SurveyOut,
)
from app.services import survey_engine
from app.services.llm import _extract_json, get_llm

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
            condiciones=[c.model_dump() for c in q.condiciones],
        ))
    db.commit()
    db.refresh(s)
    return s


@router.patch("/{sid}", response_model=SurveyOut)
def patch_survey(sid: int, payload: dict, db: Session = Depends(get_db)):
    """Actualiza campos de metadatos de la encuesta (descripcion, nombre, tema)."""
    from fastapi import Body
    s = _get(db, sid)
    for field in ("nombre", "tema", "descripcion", "idioma"):
        if field in payload:
            setattr(s, field, payload[field])
    db.commit(); db.refresh(s)
    return s


@router.post("/{sid}/cancel", status_code=200)
def cancel_survey(sid: int, db: Session = Depends(get_db)):
    """Cancela una encuesta en ejecución: la devuelve a draft y borra respuestas parciales."""
    s = _get(db, sid)
    if s.estado != "running":
        raise HTTPException(status_code=409, detail="La encuesta no está en ejecución.")
    s.estado = "draft"
    s.error_msg = None
    db.query(SurveyResponse).filter(SurveyResponse.survey_id == sid).delete()
    db.commit()
    return {"ok": True}


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


_IMPORT_SYSTEM = """Eres experto en investigación de mercados. Analizas cuestionarios escritos en
cualquier formato y los conviertes a un JSON estructurado.
Tipos de pregunta disponibles: single (opción única), multiple (opción múltiple),
yesno (sí/no), likert (escala 1-5), nps (0-10), abierta (texto libre).
Responde SIEMPRE en JSON válido, sin texto fuera del JSON."""

_IMPORT_SCHEMA = """{
  "nombre": "Nombre del cuestionario",
  "tema": "Tema o contexto",
  "preguntas": [
    {
      "texto": "Texto de la pregunta",
      "tipo": "single|multiple|yesno|likert|nps|abierta",
      "opciones": ["opción A", "opción B"],
      "condiciones": [
        {"si_respuesta": "No", "ir_a_orden": 3}
      ]
    }
  ]
}
NOTAS:
- opciones: [] para yesno, likert, nps, abierta.
- condiciones: [] si no hay saltos. ir_a_orden es el índice 0-based de la pregunta destino
  (la posición en el array, empezando en 0). null en ir_a_orden = terminar encuesta.
- Detecta saltos como "Si responde No, saltar a P5", "Si SÍ, ir a la pregunta 7", etc.
- El primer índice es 0."""


def _extract_text(file_bytes: bytes, filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        import pdfplumber  # ya instalado
        text_parts = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        return "\n".join(text_parts)
    if name.endswith((".docx", ".doc")):
        from docx import Document  # ya instalado
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    # Fallback: intentar como UTF-8
    return file_bytes.decode("utf-8", errors="replace")


@router.post("/generate-intro")
async def generate_intro(payload: dict, db: Session = Depends(get_db)):
    """Genera un texto de bienvenida con Claude a partir de un system+prompt del frontend."""
    llm = get_llm("anthropic")
    system = payload.get("system", "Eres experto en investigación de mercados.")
    prompt = payload.get("prompt", "")
    if not prompt:
        raise HTTPException(status_code=400, detail="Falta el prompt.")
    texto = llm.complete_text(system, prompt, reasoning_effort="low")
    return {"texto": texto.strip()}


@router.post("/parse-file", response_model=SurveyImportDraft)
async def parse_file(
    file: UploadFile = File(...),
    idioma: str = Form(default="es"),
    pais: str = Form(default="ES"),
) -> SurveyImportDraft:
    """Importa un cuestionario desde PDF o Word. Devuelve el borrador para revisión (no guarda)."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El fichero está vacío.")
    text = _extract_text(content, file.filename or "")
    if not text.strip():
        raise HTTPException(status_code=422, detail="No se pudo extraer texto del fichero.")
    llm = get_llm("anthropic")  # importador usa Claude (OpenAI puede estar al límite de cuota)
    user_prompt = (
        f"Analiza el siguiente cuestionario (idioma: {idioma}, país: {pais}) y "
        f"conviértelo al esquema JSON pedido:\n\n{_IMPORT_SCHEMA}\n\n"
        f"CUESTIONARIO:\n{text[:12000]}"  # límite de contexto
    )
    try:
        raw = llm.complete_text(_IMPORT_SYSTEM, user_prompt)
        data = _extract_json(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Error al parsear con LLM: {e}") from e
    try:
        return SurveyImportDraft(**data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Respuesta del LLM no válida: {e}") from e


@router.get("/{sid}/export")
def export(sid: int, db: Session = Depends(get_db)):
    s = _get(db, sid)
    content = survey_engine.export_xlsx(db, s)
    return FastAPIResponse(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="encuesta_{sid}.xlsx"'},
    )


@router.get("/{sid}/export-pptx")
def export_pptx(sid: int, db: Session = Depends(get_db)):
    """Exporta los resultados de la encuesta como .pptx con identidad Andersen Consulting."""
    s = _get(db, sid)
    content = survey_engine.export_survey_pptx(db, s)
    nombre = (s.nombre or f"encuesta_{sid}").replace(" ", "_")[:40]
    return FastAPIResponse(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{nombre}.pptx"'},
    )


@router.get("/{sid}/export-docx")
def export_docx(sid: int, db: Session = Depends(get_db)):
    """Exporta el cuestionario como .docx con identidad corporativa Andersen."""
    s = _get(db, sid)
    content = survey_engine.export_survey_docx(s)
    nombre = (s.nombre or f"encuesta_{sid}").replace(" ", "_")[:40]
    return FastAPIResponse(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{nombre}.docx"'},
    )
