"""Motor del focus group en formato CHAT en vivo.

El moderador envía una pregunta cada vez (a todos, a varios o a una persona).
Cada turno se genera con el contexto de TODA la conversación previa del chat,
de modo que el debate es acumulativo y coherente.

Para cada turno:
- Se determinan los destinatarios (lista de la pregunta; vacío = todos los miembros).
- Cada destinatario responde secuencialmente, viendo:
    1) el transcript completo de la conversación previa, y
    2) las respuestas ya dadas por otras personas EN ESTE MISMO turno (dinámica de grupo).
- Cada respuesta se persiste al instante (el frontend la muestra en vivo vía polling).

Se ejecuta en segundo plano (BackgroundTasks).
"""

from __future__ import annotations

import random

from sqlalchemy.orm import Session

from app.countries import country_name, cultural_context_block
from app.database import SessionLocal
from app.models import FocusGroup, Persona, Question, Response
from app.services.llm import get_llm

_SYSTEM_TMPL = """Eres {nombre}, una persona real que participa en un focus group online por chat.
Respondes SIEMPRE en primera persona, en {idioma}, de forma natural y coherente con tu perfil.
No rompes el personaje ni mencionas que eres una IA. Tienes en cuenta lo que ya se ha hablado.

LONGITUD VARIABLE Y NATURAL, nunca uniforme: ajústala a lo que la pregunta merece y a tu forma
de ser. A veces basta una frase corta o unas pocas palabras ("La verdad, ni idea", "Totalmente
de acuerdo con X", "Buf, no me convence"); otras veces, si el tema te toca, te extiendes y
argumentas. Las personas calladas/prácticas responden breve; las habladoras/expertas se explayan.
No fuerces un número fijo de frases.

SÉ LO MÁS REALISTA Y HUMANO POSIBLE:
- Habla coloquial, como en un chat real: muletillas, expresiones propias de tu edad/país/cultura,
  alguna interjección.
- NO uses emojis ni emoticonos en ningún caso. Exprésate solo con palabras.
- TU ESTRUCTURA Y LONGITUD SON ÚNICAS Y TUYAS. NO imites el formato, el orden de las ideas ni
  las frases de los demás participantes. Si todos empiezan igual, tú empiezas distinto.
- PROHIBIDO el patrón "Sí, también… Han hecho un gran trabajo… Sin embargo…". No abras siempre
  dando la razón ni cierres con una coletilla de sostenibilidad/equilibrio. Varía radicalmente
  cómo empiezas, cómo argumentas y cómo terminas respecto a los demás.
- Algunas personas sueltan un monosílabo o una frase; otras se enrollan muchísimo. Sé fiel a tu
  carácter (un callado contesta seco; un hablador divaga).
- Reacciona a lo que han dicho otros: dales la razón, mátizalos o discrépales abiertamente.
- NO seas siempre políticamente correcto ni respondas "de manual": di lo que de verdad pensaría
  alguien como tú, aunque sea incómodo o poco popular.
- De vez en cuando aporta una idea DISRUPTIVA o inesperada: cuestiona la premisa de la pregunta,
  sal por la tangente con una anécdota personal, propón un ángulo que nadie ha mencionado, o
  cambia el enfoque. No todas las respuestas tienen que ir "por el guion".
- Puedes dudar, cambiar de opinión a media conversación, o admitir que no sabes.
Mantén siempre la coherencia con tu perfil: tus rasgos de personalidad marcan si eres más
provocador, conformista, escéptico, entusiasta, etc.

RESPONDE SIN PREJUICIOS, SEGÚN TODO TU PERFIL:
- Tu opinión nace de TODAS tus características (situación socioeconómica, ocupación, consumo,
  valores, biografía, experiencia vital), no de un solo rasgo ni de un cliché sobre tu grupo.
- Eres un INDIVIDUO concreto y matizado, no un estereotipo: evita respuestas prejuiciosas,
  caricaturescas o predecibles "porque eres de tal edad/clase/región". Responde como lo haría
  esa persona real con toda su complejidad.

HABLA COMO HABLARÍA ALGUIEN CON TU PERFIL CONCRETO (registro/idiolecto propio):
- Tu LÉXICO y tu forma de hablar están MARCADOS por tus características. Adáptalos de verdad:
  · ORIGEN NACIONAL: si naciste fuera de {pais}, usa los modismos y el acento escrito de tu país
    de origen (alguien de otro país, hablando español, NO suena igual ni usa las mismas palabras
    que alguien de {pais}).
  · ORIGEN REGIONAL: refleja el deje y las expresiones propias de tu región o zona dentro de
    {pais}, sin exagerar hasta la caricatura.
  · NIVEL ECONÓMICO Y EDUCATIVO: tu registro (culto/llano), riqueza de vocabulario y formalidad
    dependen de tus estudios e ingresos. Alguien sin estudios o de clase baja NO habla como un
    directivo con posgrado; un joven no habla como un jubilado.
- Sé coherente con todo eso a la vez: el resultado debe sonar a esa persona concreta, no genérico.
- NADA de respuestas "de libro", neutras, equilibradas ni de manual. Habla en primera persona,
  con tu punto de vista subjetivo, tus prioridades y tus sesgos, como una persona real en un chat.
- Coloquial y natural, pero SIEMPRE RESPETUOSO con los demás participantes: puedes discrepar con
  firmeza, llevar la contraria o defender tu postura, pero sin insultar ni faltar al respeto.
- No tienes que estar de acuerdo con nadie: si piensas distinto, dilo claramente y a tu manera.

EL MODERADOR HUMANO MANDA:
- Hazle MUCHO caso: responde exactamente a lo que pregunta, sigue sus indicaciones y no te
  desvíes del foco. NO te rebeles contra el moderador, no lo cuestiones ni lo desafíes; el
  respeto y la obediencia al moderador son prioritarios. (Con los DEMÁS participantes sí puedes
  discrepar libremente.)

FORMA DE ESCRIBIR:
- NO digas tu propio nombre en la respuesta: no firmes, no empieces con "Soy X…" ni te refieras
  a ti en tercera persona. El sistema ya muestra quién habla. Responde directamente, en primera
  persona, como en un chat.

{contexto_pais}

Tu perfil:
{perfil}"""


# Focus groups cuya generación se ha pedido interrumpir (memoria de proceso).
_CANCEL: set[int] = set()


def request_cancel(focus_group_id: int) -> None:
    """Señala que se interrumpa la generación en curso de este focus group.
    El motor se detiene tras la respuesta que esté generando en ese momento."""
    _CANCEL.add(focus_group_id)


def _detect_starter(pregunta: str, nombres: list[str]) -> str | None:
    """Detecta si el moderador pide explícitamente que una persona concreta
    COMIENCE a responder (p. ej. 'Carlos, empieza tú'). Devuelve el nombre
    exacto de la lista o None. Solo consulta al LLM si se menciona algún nombre."""
    if not nombres:
        return None
    texto = pregunta.lower()
    if not any(n.split()[0].lower() in texto for n in nombres if n):
        return None
    llm = get_llm("anthropic")
    system = (
        "Detectas si el moderador de un focus group pide que UNA persona concreta "
        "empiece o responda primero. Respondes SIEMPRE en JSON válido."
    )
    user = (
        f'Pregunta del moderador: "{pregunta}"\n'
        f"Personas que pueden responder: {nombres}\n\n"
        'Si el moderador pide explícitamente que alguna COMIENCE/responda primero '
        '(ej.: "Carlos, empieza tú", "que abra María"), devuelve su nombre EXACTO de '
        'la lista. Si no lo pide, null.\n'
        'JSON: {"starter": "<nombre exacto o null>"}'
    )
    try:
        s = llm.complete_json(system, user, reasoning_effort="low").get("starter")
    except Exception:  # noqa: BLE001
        return None
    return s if s in nombres else None


def _persona_perfil(p: Persona) -> str:
    partes = [f"Biografía: {p.bio}" if p.bio else ""]
    if p.sociodemografico:
        partes.append(f"Datos sociodemográficos: {p.sociodemografico}")
    if p.consumidor:
        partes.append(f"Perfil de consumo: {p.consumidor}")
    if p.opinion:
        partes.append(f"Valores y opiniones: {p.opinion}")
    return "\n".join(x for x in partes if x)


def _build_transcript(prev_questions: list[Question]) -> str:
    """Transcript cronológico de toda la conversación previa del chat."""
    lineas: list[str] = []
    for q in prev_questions:
        lineas.append(f"Moderador: {q.texto}")
        for r in sorted(q.responses, key=lambda x: x.orden):
            lineas.append(f"{r.persona_nombre}: {r.texto}")
    return "\n".join(lineas)


# Estilos de respuesta (peso, instrucción). Se sortea uno por respuesta para
# romper la uniformidad de longitud y estructura entre personas.
_ESTILOS = [
    (3, "Responde MUY breve: un monosílabo o muy pocas palabras (p. ej. 'Ni idea', "
        "'Coca-Cola, claro', 'Bah, paso del tema'). Nada más."),
    (4, "Responde corto y directo: una sola frase, sin rodeos."),
    (5, "Longitud media, a tu manera; nada de plantilla."),
    (3, "Explávate y enróllate: cuéntalo con detalle, mete alguna anécdota personal o "
        "digresión. Tono verborrágico."),
    (2, "Tono cortante, desganado o irónico; pocas ganas de dar explicaciones."),
    (2, "Empieza con una pregunta de vuelta o cuestionando la premisa, y sé poco convencional."),
]


def _estilo() -> str:
    pesos = [w for w, _ in _ESTILOS]
    textos = [t for _, t in _ESTILOS]
    return random.choices(textos, weights=pesos, k=1)[0]


def _build_user_prompt(
    tema: str,
    transcript: str,
    pregunta: str,
    turno_previas: list[tuple[str, str]],
    estilo: str,
) -> str:
    bloques = []
    if tema:
        bloques.append(f"Tema del focus group: {tema}")
    if transcript:
        bloques.append("Conversación hasta ahora:\n" + transcript)
    bloques.append(f"Ahora el moderador pregunta: {pregunta}")
    if turno_previas:
        lineas = "\n".join(f"- {nombre}: {texto}" for nombre, texto in turno_previas)
        bloques.append(
            "Otras personas ya han respondido (abajo). Puedes reaccionar, pero NO copies su "
            "estructura ni sus frases, y NO repitas lo que ya han dicho: aporta TU ángulo propio.\n"
            + lineas
        )
    bloques.append(f"Estilo OBLIGATORIO de ESTA respuesta: {estilo}")
    bloques.append("Tu respuesta:")
    return "\n\n".join(bloques)


def _answer(
    persona: Persona,
    idioma: str,
    pais: str,
    tema: str,
    transcript: str,
    pregunta: str,
    turno_previas: list[tuple[str, str]],
) -> str:
    llm = get_llm("anthropic")
    system = _SYSTEM_TMPL.format(
        nombre=persona.nombre,
        idioma=idioma,
        pais=country_name(pais),
        contexto_pais=cultural_context_block(pais),
        perfil=_persona_perfil(persona),
    )
    user = _build_user_prompt(tema, transcript, pregunta, turno_previas, _estilo())
    # Claude Opus 4.8 (adaptive thinking, effort alto) para respuestas ricas y coherentes
    return llm.complete_text(system, user)


def answer_question(focus_group_id: int, question_id: int) -> None:
    """Genera las respuestas de un único turno del chat. Gestiona su propia
    sesión de BBDD (corre en un hilo de background)."""
    db: Session = SessionLocal()
    try:
        fg = db.get(FocusGroup, focus_group_id)
        question = db.get(Question, question_id)
        if fg is None or question is None:
            return

        _CANCEL.discard(focus_group_id)  # limpia cualquier señal previa
        fg.estado = "running"
        fg.error_msg = None
        db.commit()

        # Miembros del focus group (orden estable por id)
        member_ids = [m.persona_id for m in fg.members]
        personas = {
            p.id: p
            for p in db.query(Persona).filter(Persona.id.in_(member_ids)).all()
        }
        ordered_members = [personas[i] for i in member_ids if i in personas]

        # Destinatarios: lista de la pregunta o, si vacía, todos los miembros
        dest_ids = question.destinatarios or []
        if dest_ids:
            responders = [personas[i] for i in dest_ids if i in personas]
        else:
            responders = list(ordered_members)

        # Orden ALEATORIO de respondedores (cada respuesta alimenta el contexto
        # de la siguiente). Excepción: si el moderador pide en el texto que alguien
        # comience, esa persona abre y el resto sigue en orden aleatorio.
        random.shuffle(responders)
        starter = _detect_starter(question.texto, [p.nombre for p in responders])
        if starter:
            responders = (
                [p for p in responders if p.nombre == starter]
                + [p for p in responders if p.nombre != starter]
            )

        # Transcript de toda la conversación previa (preguntas con orden menor)
        prev_questions = (
            db.query(Question)
            .filter(
                Question.focus_group_id == focus_group_id,
                Question.orden < question.orden,
            )
            .order_by(Question.orden)
            .all()
        )
        transcript = _build_transcript(prev_questions)

        # Limpia respuestas previas de este turno (re-ejecución)
        db.query(Response).filter(Response.question_id == question.id).delete()
        db.commit()

        turno_previas: list[tuple[str, str]] = []
        for idx, persona in enumerate(responders):
            if focus_group_id in _CANCEL:
                break  # el moderador ha interrumpido el turno
            texto = _answer(
                persona, fg.idioma, fg.pais, fg.tema, transcript, question.texto, turno_previas
            )
            resp = Response(
                question_id=question.id,
                persona_id=persona.id,
                persona_nombre=persona.nombre,
                texto=texto,
                orden=idx,
            )
            db.add(resp)
            db.commit()  # persistencia incremental → efecto "en vivo"
            turno_previas.append((persona.nombre, texto))

        _CANCEL.discard(focus_group_id)
        fg.estado = "active"
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        fg = db.get(FocusGroup, focus_group_id)
        if fg is not None:
            fg.estado = "error"
            fg.error_msg = str(exc)[:1000]
            db.commit()
    finally:
        db.close()
