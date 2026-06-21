"""Motor de encuestas cuantitativas sobre la población sintética.

- answer_survey: cada persona responde el cuestionario completo en su personaje
  (una llamada al LLM por persona, salida JSON validada contra las opciones).
- compute_results: distribución por pregunta (+ media/NPS) y cruce por segmento.
- export_xlsx: respuestas crudas + tablas por pregunta.
"""

from __future__ import annotations

import io
import json
from concurrent.futures import ThreadPoolExecutor

from openpyxl import Workbook
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Persona, Survey, SurveyResponse
from app.services.llm import get_llm

# Variables de cruce admitidas -> campo del snapshot
BREAK_FIELDS = {
    "genero": "genero", "region": "region", "ingresos": "ingresos",
    "educacion": "nivel_educativo", "edad": "edad",
}
AGE_BANDS = [("18-24", 18, 24), ("25-34", 25, 34), ("35-44", 35, 44), ("45-54", 45, 54),
             ("55-64", 55, 64), ("65-74", 65, 74), ("75-84", 75, 84), ("85+", 85, 200)]
NPS_GROUPS = ["Detractores (0-6)", "Pasivos (7-8)", "Promotores (9-10)"]
LIKERT = ["1", "2", "3", "4", "5"]


def _age_band(edad) -> str:
    if edad is None:
        return "—"
    for label, lo, hi in AGE_BANDS:
        if lo <= edad <= hi:
            return label
    return "85+" if isinstance(edad, int) and edad > 85 else "—"


def _snapshot(p: Persona) -> dict:
    sd = p.sociodemografico or {}
    return {
        "edad": sd.get("edad"), "genero": sd.get("genero"), "region": sd.get("region"),
        "ingresos": sd.get("ingresos"), "nivel_educativo": sd.get("nivel_educativo"),
        "pais_origen": sd.get("pais_origen"),
    }


def _perfil(p: Persona) -> str:
    partes = [f"Bio: {p.bio}" if p.bio else ""]
    if p.sociodemografico:
        partes.append(f"Sociodemografía: {p.sociodemografico}")
    if p.consumidor:
        partes.append(f"Consumo: {p.consumidor}")
    if p.opinion:
        partes.append(f"Valores y opiniones: {p.opinion}")
    return "\n".join(x for x in partes if x)


def _q_spec(q) -> str:
    if q.tipo == "single":
        return f'elige UNA de estas opciones (texto exacto): {q.opciones}'
    if q.tipo == "multiple":
        return f'elige una o varias (array de textos exactos) de: {q.opciones}'
    if q.tipo == "yesno":
        return 'responde "Sí" o "No"'
    if q.tipo == "likert":
        return 'entero del 1 (muy en desacuerdo) al 5 (muy de acuerdo)'
    if q.tipo == "nps":
        return 'entero del 0 al 10 (¿qué probabilidad de recomendarlo?)'
    if q.tipo == "abierta":
        return 'responde con texto libre (1-2 frases) en tu propia voz, como string'
    return ""


def _build_prompt(survey: Survey) -> str:
    lines = []
    for q in survey.questions:
        lines.append(f'- id {q.id} [{q.tipo}] "{q.texto}" -> {_q_spec(q)}')
    return (
        f"Tema de la encuesta: {survey.tema}\n"
        "Responde a TODAS las preguntas como esta persona (según su perfil), de forma honesta y "
        "coherente con quién es. Preguntas:\n" + "\n".join(lines) + "\n\n"
        'Devuelve SOLO un JSON {"respuestas": {"<id>": valor, ...}} con el valor del tipo indicado '
        "para cada id. No añadas texto fuera del JSON."
    )


def _validate(q, raw):
    if raw is None:
        return None
    if q.tipo == "single":
        return raw if raw in q.opciones else None
    if q.tipo == "multiple":
        if isinstance(raw, list):
            vals = [x for x in raw if x in q.opciones]
            return vals or None
        return [raw] if raw in q.opciones else None
    if q.tipo == "yesno":
        s = str(raw).strip().lower()
        if s.startswith("s"):
            return "Sí"
        if s.startswith("n"):
            return "No"
        return None
    if q.tipo in ("likert", "nps"):
        try:
            v = int(round(float(raw)))
        except (ValueError, TypeError):
            return None
        return max(1, min(5, v)) if q.tipo == "likert" else max(0, min(10, v))
    if q.tipo == "abierta":
        s = str(raw).strip()
        return s or None
    return None


def answer_survey(survey_id: int, persona_ids: list[int], modelo: str,
                  reasoning_effort: str | None) -> None:
    db: Session = SessionLocal()
    try:
        survey = db.get(Survey, survey_id)
        if survey is None:
            return
        survey.estado = "running"
        survey.error_msg = None
        survey.modelo = modelo
        survey.reasoning_effort = reasoning_effort
        # limpia respuestas previas (re-lanzamiento)
        db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey_id).delete()
        db.commit()

        personas = {
            p.id: p for p in db.query(Persona).filter(Persona.id.in_(persona_ids)).all()
        }
        ordered = [personas[i] for i in persona_ids if i in personas]
        questions = list(survey.questions)
        prompt = _build_prompt(survey)
        llm = get_llm()

        def ask(p: Persona):
            system = (
                f"Eres {p.nombre}, una persona real que participa en una encuesta. Respondes en tu "
                f"personaje, en {survey.idioma}. Responde SIEMPRE en JSON válido.\n\nTu perfil:\n{_perfil(p)}"
            )
            try:
                data = llm.complete_json(system, prompt, model=modelo, reasoning_effort=reasoning_effort)
                return p, data.get("respuestas", {})
            except Exception:  # noqa: BLE001
                return p, None

        with ThreadPoolExecutor(max_workers=8) as ex:
            for i, (p, raw) in enumerate(ex.map(ask, ordered), 1):
                if raw is None:
                    continue
                resp = {}
                for q in questions:
                    v = _validate(q, raw.get(str(q.id), raw.get(q.id)))
                    if v is not None:
                        resp[str(q.id)] = v
                db.add(SurveyResponse(
                    survey_id=survey_id, persona_id=p.id,
                    snapshot=_snapshot(p), respuestas=resp,
                ))
                if i % 20 == 0:
                    db.commit()
        db.commit()
        survey.estado = "completed"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        s = db.get(Survey, survey_id)
        if s is not None:
            s.estado = "error"
            s.error_msg = str(exc)[:1000]
            db.commit()
    finally:
        db.close()


# ---------- Resultados ----------

def _seg_value(snapshot: dict, break_var: str) -> str:
    field = BREAK_FIELDS[break_var]
    val = snapshot.get(field)
    if break_var == "edad":
        return _age_band(val)
    return str(val) if val not in (None, "") else "—"


def _options_for(q) -> list[str]:
    if q.tipo == "yesno":
        return ["Sí", "No"]
    if q.tipo == "likert":
        return LIKERT
    if q.tipo == "nps":
        return NPS_GROUPS
    return list(q.opciones)


def _bucket(q, value):
    """Devuelve la(s) categoría(s) de una respuesta para la distribución."""
    if value is None:
        return []
    if q.tipo == "multiple":
        return list(value)
    if q.tipo == "likert":
        return [str(value)]
    if q.tipo == "nps":
        v = int(value)
        return [NPS_GROUPS[0] if v <= 6 else NPS_GROUPS[1] if v <= 8 else NPS_GROUPS[2]]
    return [str(value)]


def _distrib(q, values: list) -> tuple[list[dict], int]:
    opts = _options_for(q)
    counts = {o: 0 for o in opts}
    n = 0
    for v in values:
        cats = _bucket(q, v)
        if cats:
            n += 1
        for c in cats:
            counts[c] = counts.get(c, 0) + 1
    base = n or 1
    dist = [{"opcion": o, "n": counts.get(o, 0), "pct": round(counts.get(o, 0) * 100 / base, 1)}
            for o in opts]
    return dist, n


def compute_results(db: Session, survey: Survey, break_var: str | None) -> dict:
    responses = db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey.id).all()
    preguntas = []
    for q in survey.questions:
        vals = [r.respuestas.get(str(q.id)) for r in responses if r.respuestas.get(str(q.id)) is not None]
        # Las preguntas abiertas no tienen distribución: se devuelven los verbatims.
        if q.tipo == "abierta":
            textos = [str(v) for v in vals]
            preguntas.append({
                "question_id": q.id, "texto": q.texto, "tipo": q.tipo, "n": len(textos),
                "distribucion": [], "media": None, "nps": None, "cruce": {}, "textos": textos,
            })
            continue
        dist, n = _distrib(q, vals)
        media = None
        nps = None
        if q.tipo in ("likert", "nps"):
            nums = [int(v) for v in vals if isinstance(v, (int, float))]
            if nums:
                media = round(sum(nums) / len(nums), 2)
            if q.tipo == "nps" and nums:
                promo = sum(1 for v in nums if v >= 9)
                detr = sum(1 for v in nums if v <= 6)
                nps = round((promo - detr) * 100 / len(nums), 1)
        cruce = {}
        if break_var in BREAK_FIELDS:
            segs: dict[str, list] = {}
            for r in responses:
                v = r.respuestas.get(str(q.id))
                if v is None:
                    continue
                segs.setdefault(_seg_value(r.snapshot or {}, break_var), []).append(v)
            for seg, sv in sorted(segs.items()):
                cruce[seg] = _distrib(q, sv)[0]
        preguntas.append({
            "question_id": q.id, "texto": q.texto, "tipo": q.tipo, "n": n,
            "distribucion": dist, "media": media, "nps": nps, "cruce": cruce, "textos": [],
        })
    return {
        "estado": survey.estado, "total_respuestas": len(responses),
        "break_var": break_var if break_var in BREAK_FIELDS else None, "preguntas": preguntas,
    }


def export_xlsx(db: Session, survey: Survey) -> bytes:
    responses = db.query(SurveyResponse).filter(SurveyResponse.survey_id == survey.id).all()
    wb = Workbook()

    ws = wb.active
    ws.title = "Respuestas"
    qcols = list(survey.questions)
    ws.append(["persona_id", "edad", "genero", "region", "ingresos", "educacion"]
              + [f"P{i+1}" for i in range(len(qcols))])
    for r in responses:
        s = r.snapshot or {}
        row = [r.persona_id, s.get("edad"), s.get("genero"), s.get("region"),
               s.get("ingresos"), s.get("nivel_educativo")]
        for q in qcols:
            v = r.respuestas.get(str(q.id))
            row.append(", ".join(v) if isinstance(v, list) else v)
        ws.append(row)

    res = compute_results(db, survey, None)
    ws2 = wb.create_sheet("Resultados")
    for q in res["preguntas"]:
        ws2.append([q["texto"]])
        if q["tipo"] == "abierta":
            ws2.append([f"Respuestas abiertas (n={q['n']})"])
            for t in q.get("textos", []):
                ws2.append([t])
            ws2.append([])
            continue
        ws2.append(["Opción", "N", "%"])
        for o in q["distribucion"]:
            ws2.append([o["opcion"], o["n"], o["pct"]])
        if q["media"] is not None:
            ws2.append(["media", q["media"]])
        if q["nps"] is not None:
            ws2.append(["NPS", q["nps"]])
        ws2.append([])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
