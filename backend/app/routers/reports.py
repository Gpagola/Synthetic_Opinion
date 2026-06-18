from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FocusGroup
from app.schemas.focus_group import ReportOut
from app.services import report_gen

router = APIRouter(prefix="/focus-groups", tags=["reports"])

_MIME = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _get_fg(fg_id: int, db: Session) -> FocusGroup:
    fg = db.get(FocusGroup, fg_id)
    if fg is None:
        raise HTTPException(status_code=404, detail="Focus group no encontrado")
    return fg


@router.post("/{fg_id}/report", response_model=ReportOut)
def create_report(fg_id: int, db: Session = Depends(get_db)):
    fg = _get_fg(fg_id, db)
    if fg.estado == "running":
        raise HTTPException(
            status_code=409,
            detail="Espera a que terminen de responder antes de generar el informe",
        )
    hay_respuestas = any(q.responses for q in fg.questions)
    if not hay_respuestas:
        raise HTTPException(
            status_code=400,
            detail="No hay conversación todavía para generar un informe",
        )
    try:
        return report_gen.generate_report(db, fg)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Error generando informe: {exc}")


@router.get("/{fg_id}/report", response_model=ReportOut)
def get_report(fg_id: int, db: Session = Depends(get_db)):
    fg = _get_fg(fg_id, db)
    if not fg.reports:
        raise HTTPException(status_code=404, detail="Aún no hay informe generado")
    return sorted(fg.reports, key=lambda r: r.generated_at)[-1]


@router.delete("/{fg_id}/report", status_code=204)
def discard_report(fg_id: int, db: Session = Depends(get_db)):
    """Descarta (borra) los informes generados de este focus group.
    La conversación del chat se conserva intacta."""
    fg = _get_fg(fg_id, db)
    for report in list(fg.reports):
        db.delete(report)
    db.commit()


@router.get("/{fg_id}/report/export")
def export_report(fg_id: int, format: str = "pdf", db: Session = Depends(get_db)):
    fg = _get_fg(fg_id, db)
    if format not in _MIME:
        raise HTTPException(status_code=400, detail="Formato no soportado (pdf|docx|xlsx)")

    if format == "xlsx":
        content = report_gen.export_xlsx(fg)
    else:
        if not fg.reports:
            raise HTTPException(status_code=404, detail="Aún no hay informe generado")
        report = sorted(fg.reports, key=lambda r: r.generated_at)[-1]
        content = (
            report_gen.export_pdf(report, fg)
            if format == "pdf"
            else report_gen.export_docx(report, fg)
        )

    filename = f"informe_focus_{fg_id}.{format}"
    return FastAPIResponse(
        content=content,
        media_type=_MIME[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
