import { useEffect, useRef, useState } from "react";
import { api, ConditionRule, Persona, QuestionIn, Survey, SurveyImportDraft, SurveyResults } from "../api/client";
import { useCountry } from "../CountryContext";
import { getCountry, Band } from "../countries";

// ─── Constantes compartidas ───────────────────────────────────────────────────

const Q_TYPES = [
  { v: "single",   label: "Opción única" },
  { v: "multiple", label: "Opción múltiple" },
  { v: "yesno",    label: "Sí / No" },
  { v: "likert",   label: "Escala 1–5" },
  { v: "nps",      label: "NPS 0–10" },
  { v: "abierta",  label: "Pregunta abierta" },
];
const NEEDS_OPTIONS = new Set(["single", "multiple"]);
const BREAKS = [
  { v: "", label: "Sin cruce" }, { v: "genero", label: "Sexo" }, { v: "edad", label: "Edad" },
  { v: "region", label: "Región" }, { v: "ingresos", label: "Ingresos" }, { v: "educacion", label: "Educación" },
];

type EditQ = QuestionIn & { opcText?: string; condiciones: ConditionRule[] };
const splitOpts = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

// ─── Helpers muestra ──────────────────────────────────────────────────────────

function normGen(g?: string | null) {
  const s = (g ?? "").toLowerCase();
  if (s.startsWith("muj") || s.startsWith("fem")) return "Mujer";
  if (s.startsWith("hom") || s.startsWith("masc") || s.startsWith("var")) return "Hombre";
  return "Otro";
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function bandOf(edad: number | null | undefined, bands: Band[]) {
  if (edad == null) return null;
  for (const [l, lo, hi] of bands) if (edad >= lo && edad <= hi) return l;
  if (edad > bands[bands.length - 1][2]) return bands[bands.length - 1][0];
  return null;
}
function quotaSample(personas: Persona[], N: number, bands: Band[]): number[] {
  const byCell: Record<string, Persona[]> = {};
  for (const p of personas) {
    const sd = p.sociodemografico ?? {};
    const b = bandOf(sd.edad, bands); const g = normGen(sd.genero);
    if (b && (g === "Mujer" || g === "Hombre")) (byCell[`${b}|${g}`] ||= []).push(p);
  }
  const picked: number[] = []; const used = new Set<number>();
  for (const [band, , , share, fem] of bands) {
    for (const [g, prop] of [["Mujer", fem], ["Hombre", 1 - fem]] as [string, number][]) {
      const pool = shuffle([...(byCell[`${band}|${g}`] ?? [])]);
      for (const p of pool.slice(0, Math.round(N * share * prop))) { picked.push(p.id); used.add(p.id); }
    }
  }
  if (picked.length < N)
    for (const p of shuffle(personas.filter((x) => !used.has(x.id))).slice(0, N - picked.length)) picked.push(p.id);
  return picked.slice(0, N);
}

// ─── Página principal (lista) ─────────────────────────────────────────────────

export default function SurveysPage() {
  const { pais, country } = useCountry();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const load = () => api.listSurveys().then(setSurveys).catch(console.error);
  useEffect(() => { load(); }, []);
  const visibles = surveys.filter((s) => (s.pais || "ES") === pais);

  if (selectedId !== null)
    return <SurveyDetail id={selectedId} onBack={() => { setSelectedId(null); load(); }} />;
  return (
    <div className="w80">
      <div className="toolbar">
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>Encuestas</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCreating(true)}>+ Nueva encuesta</button>
      </div>
      <p className="muted" style={{ marginTop: "-0.5rem" }}>
        Encuestas cuantitativas sobre la población sintética. Resultados simulados por IA: exploran hipótesis, no sustituyen una encuesta real.
      </p>
      <div className="card table-card">
        <table>
          <thead><tr><th>Nombre</th><th>Tema</th><th>País</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {visibles.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.nombre}</strong></td>
                <td>{s.tema}</td>
                <td>{getCountry(s.pais).nombre}</td>
                <td>{s.estado}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="secondary" onClick={() => setSelectedId(s.id)}>Abrir</button>{" "}
                  <button className="danger" onClick={async () => {
                    if (!confirm(`¿Borrar la encuesta "${s.nombre}"?`)) return;
                    setSurveys((prev) => prev.filter((x) => x.id !== s.id));
                    await api.deleteSurvey(s.id).catch(() => load());
                  }}>Borrar</button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={5} className="muted">Aún no hay encuestas en {country.nombre}.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <CreateModal onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); load(); setSelectedId(id); }} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { pais, country } = useCountry();
  const [f, setF] = useState({ nombre: "", tema: "", idioma: "es", pais });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nueva encuesta</h2>
        <div><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label>Tema</label><input value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} /></div>
        <div><label>País</label><input value={country.nombre} disabled /></div>
        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button disabled={!f.nombre} onClick={async () => onCreated((await api.createSurvey(f)).id)}>Crear</button>
        </div>
      </div>
    </div>
  );
}

// ─── Vista de detalle de encuesta ─────────────────────────────────────────────

function SurveyDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [questions, setQuestions] = useState<EditQ[]>([]);
  const [tab, setTab] = useState<"design" | "run">("design");

  // Estado de ejecución
  const [method, setMethod] = useState<"representativa" | "aleatoria" | "segmento">("representativa");
  const [N, setN] = useState(200);
  const [seg, setSeg] = useState({ region: "", genero: "", edadMin: "", edadMax: "" });
  const [modelo, setModelo] = useState("gpt-4o");
  const [estado, setEstado] = useState("draft");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [breakVar, setBreakVar] = useState("");
  const [results, setResults] = useState<SurveyResults | null>(null);
  const pollRef = useRef<number | null>(null);
  const breakVarRef = useRef("");
  useEffect(() => { breakVarRef.current = breakVar; }, [breakVar]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSurvey(id).then((s) => {
      setSurvey(s); setEstado(s.estado);
      setQuestions(s.questions.map((q) => ({
        texto: q.texto, tipo: q.tipo, opciones: q.opciones, obligatoria: q.obligatoria,
        opcText: q.opciones.join(", "), condiciones: q.condiciones ?? [],
      })));
      setModelo(s.modelo || "gpt-4o");
      api.listPersonas(undefined, s.pais).then(setPersonas);
      if (s.estado === "completed") loadResults("");
    });
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [id]);

  const country = getCountry(survey?.pais);
  const eligible = personas.filter((p) => {
    const sd = p.sociodemografico ?? {};
    if (seg.region && sd.region !== seg.region) return false;
    if (seg.genero && normGen(sd.genero) !== seg.genero) return false;
    if (seg.edadMin && (sd.edad == null || sd.edad < +seg.edadMin)) return false;
    if (seg.edadMax && (sd.edad == null || sd.edad > +seg.edadMax)) return false;
    return true;
  });
  const sampleIds = (): number[] => {
    if (method === "representativa") return quotaSample(personas, N, country.pyramidBands);
    const pool = method === "segmento" ? eligible : personas;
    return shuffle([...pool]).slice(0, N).map((p) => p.id);
  };
  const previewN = method === "segmento" ? Math.min(N, eligible.length) : Math.min(N, personas.length);
  const regions = Array.from(new Set(personas.map((p) => p.sociodemografico?.region).filter(Boolean))) as string[];

  const saveQuestions = async (qs?: EditQ[]) => {
    const list = qs ?? questions;
    setSaving(true);
    try {
      const payload: QuestionIn[] = list.map((q) => ({
        texto: q.texto, tipo: q.tipo, obligatoria: q.obligatoria ?? true,
        opciones: NEEDS_OPTIONS.has(q.tipo) ? splitOpts(q.opcText ?? q.opciones.join(", ")) : [],
        condiciones: q.condiciones ?? [],
      }));
      setSurvey(await api.setSurveyQuestions(id, payload));
    } finally { setSaving(false); }
  };

  const loadResults = (bv: string) => api.surveyResults(id, bv).then(setResults).catch(() => {});

  const cancel = async () => {
    if (!window.confirm("¿Cancelar la encuesta en curso? Quedará en estado borrador.")) return;
    try { await api.cancelSurvey(id); } catch { /* ignorar */ }
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    setEstado("draft"); setProgress(null); setResults(null);
  };

  const launch = async () => {
    await saveQuestions();
    const ids = sampleIds();
    if (!ids.length) { alert("La muestra está vacía."); return; }
    setEstado("running"); setProgress({ done: 0, total: ids.length }); setResults(null);
    setTab("run");
    try {
      await api.launchSurvey(id, ids, modelo, modelo.startsWith("gpt-5") ? "high" : null);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        const st = await api.surveyStatus(id);
        setEstado(st.estado); setProgress({ done: st.respondidas, total: ids.length });
        if (st.respondidas > 0) loadResults(breakVarRef.current);
        if (st.estado !== "running" && pollRef.current) {
          window.clearInterval(pollRef.current); pollRef.current = null;
          loadResults(breakVarRef.current);
        }
      }, 2000);
    } catch (e) { alert("Error: " + (e as Error).message); setEstado("draft"); }
  };

  if (!survey) return <div className="loading-center"><span className="spinner blink">Cargando…</span></div>;

  return (
    <div className="w80">
      {/* Barra de título */}
      <div className="toolbar" style={{ position: "relative", alignItems: "center" }}>
        <button className="secondary" onClick={onBack}
          style={{ position: "absolute", left: "-7.5rem", top: "50%", transform: "translateY(-50%)" }}>← Volver</button>
        <div>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.2rem" }}>{survey.nombre}</h2>
          {survey.tema && <p className="muted" style={{ margin: "2px 0 0" }}>{survey.tema}</p>}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Tabs */}
      <div className="survey-tabs">
        <button className={`survey-tab${tab === "design" ? " active" : ""}`} onClick={() => setTab("design")}>
          ◈ Diseño
        </button>
        <button className={`survey-tab${tab === "run" ? " active" : ""}`} onClick={() => setTab("run")}>
          ▶ Ejecución
          {estado === "running" && <span className="blink" style={{ marginLeft: 6, color: "var(--accent-blue)" }}>●</span>}
        </button>
      </div>

      {/* ── Tab Diseño ── */}
      {tab === "design" && (
        <DesignTab
          survey={survey}
          setSurvey={(s) => setSurvey(s)}
          questions={questions}
          setQuestions={setQuestions}
          saving={saving}
          onSave={saveQuestions}
        />
      )}

      {/* ── Tab Ejecución ── */}
      {tab === "run" && (
        <RunTab
          survey={survey}
          surveyId={id}
          estado={estado}
          progress={progress}
          results={results}
          breakVar={breakVar}
          setBreakVar={(bv) => { setBreakVar(bv); loadResults(bv); }}
          method={method} setMethod={setMethod}
          N={N} setN={setN}
          seg={seg} setSeg={setSeg}
          modelo={modelo} setModelo={setModelo}
          previewN={previewN}
          regions={regions}
          country={country}
          onLaunch={launch}
          onCancel={cancel}
          questionsEmpty={questions.length === 0}
        />
      )}
    </div>
  );
}

// ─── Tab Diseño: grafo + importador ──────────────────────────────────────────

// Helpers compartidos
const trunc = (s: string, max = 22) => s.length > max ? s.slice(0, max) + "…" : s;

// Genera Word del cuestionario para imprimir

function DesignTab({ survey, setSurvey, questions, setQuestions, saving, onSave }: {
  survey: Survey;
  setSurvey: (s: Survey) => void;
  questions: EditQ[];
  setQuestions: (qs: EditQ[]) => void;
  saving: boolean;
  onSave: (qs?: EditQ[]) => Promise<void>;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [editIntro, setEditIntro] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const openEdit = (idx: number) => { setInsertAfter(null); setEditIdx(idx); };
  const openInsert = (after: number | null) => { setInsertAfter(after); setEditIdx(null); };

  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === i) return;
    const next = [...questions]; const [m] = next.splice(from, 1); next.splice(i, 0, m);
    dragIdx.current = i; setQuestions(next);
  };
  const onDragEnd = () => { dragIdx.current = null; };

  const handleImport = (draft: SurveyImportDraft) => {
    setQuestions(draft.preguntas.map((q) => ({
      texto: q.texto, tipo: q.tipo, opciones: q.opciones ?? [],
      obligatoria: q.obligatoria ?? true,
      opcText: (q.opciones ?? []).join(", "),
      condiciones: (q.condiciones ?? []) as ConditionRule[],
    })));
    setImportOpen(false);
  };

  const AddBtn = ({ after }: { after: number | null }) => (
    <div className="sq-add-row">
      <button className="sq-add-btn" onClick={() => openInsert(after)}>+ Añadir pregunta</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 740, margin: "0 auto" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button className="secondary" onClick={() => {
          if (questions.length > 0 && !confirm("¿Importar? Se reemplazarán las preguntas actuales.")) return;
          setImportOpen(true);
        }}>↑ Importar PDF/Word</button>
        <a href={api.surveyExportDocxUrl(survey.id)}
           download={`${survey.nombre.replace(/[^a-z0-9]/gi, "_")}.docx`}>
          <button className="secondary">↓ Word (.docx)</button>
        </a>
        <div style={{ flex: 1 }} />
        <button onClick={() => onSave()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/* Tarjeta de bienvenida */}
      <div className="sq-intro-card" onClick={() => setEditIntro(true)}>
        <div className="sq-intro-label">✦ Bienvenida / Introducción</div>
        <div className={survey.descripcion ? "sq-intro-text" : "sq-intro-placeholder"}>
          {survey.descripcion || "Clic para añadir un texto de bienvenida al entrevistado…"}
        </div>
      </div>

      <AddBtn after={null} />

      {/* Lista de tarjetas de preguntas */}
      {questions.map((q, i) => {
        const typeLbl = Q_TYPES.find(t => t.v === q.tipo)?.label ?? q.tipo;
        const opts = q.tipo === "yesno" ? ["Sí", "No"] :
                     q.tipo === "likert" ? ["1", "2", "3", "4", "5"] :
                     q.tipo === "nps" ? ["0 → 10"] :
                     (q.opciones ?? []);
        const skips = q.condiciones ?? [];
        return (
          <div key={i}>
            <div className="sq-card"
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDragEnd={onDragEnd}>
              <div className="sq-card-drag" title="Arrastra para reordenar">⠿</div>
              <div className="sq-card-main">
                <div className="sq-card-meta">
                  <span className="sq-card-num">P{i + 1}</span>
                  <span className="sq-card-type">{typeLbl}</span>
                  {skips.length > 0 && <span className="sq-card-logic">⤵ Lógica condicional</span>}
                  {q.obligatoria && <span className="sq-card-req">*</span>}
                </div>
                <div className="sq-card-text">
                  {q.texto || <span style={{ opacity: 0.4, fontStyle: "italic" }}>Sin texto</span>}
                </div>
                {q.tipo === "abierta" ? (
                  <div className="sq-card-open">Respuesta de texto libre</div>
                ) : opts.length > 0 ? (
                  <div className="sq-card-opts">
                    {opts.slice(0, 5).map((o, oi) => (
                      <span key={oi} className="sq-card-opt">
                        {q.tipo === "multiple" ? "☐" : "○"} {o}
                      </span>
                    ))}
                    {opts.length > 5 && <span className="sq-card-opt muted">+{opts.length - 5} más…</span>}
                  </div>
                ) : null}
                {skips.map((c, ci) => (
                  <div key={ci} className="sq-card-skip">
                    ↳ Si responde <strong>"{c.si_respuesta}"</strong>
                    {" → "}{c.ir_a_orden != null ? `ir a P${c.ir_a_orden + 1}` : "Fin de encuesta"}
                  </div>
                ))}
              </div>
              <div className="sq-card-actions">
                <button className="secondary" onClick={() => openEdit(i)}>Editar</button>
                <button className="danger" onClick={() => {
                  if (!confirm("¿Eliminar esta pregunta?")) return;
                  const updated = questions.filter((_, j) => j !== i);
                  setQuestions(updated); onSave(updated);
                }}>✕</button>
              </div>
            </div>
            <AddBtn after={i} />
          </div>
        );
      })}

      {questions.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
          <p style={{ marginBottom: "1rem" }}>Aún no hay preguntas. ¡Empieza aquí!</p>
          <button onClick={() => openInsert(null)}>+ Añadir primera pregunta</button>
        </div>
      )}

      {/* Modales */}
      {(editIdx !== null || insertAfter !== null) && (
        <NodeEditModal questions={questions} editIdx={editIdx} insertAfter={insertAfter}
          onClose={() => { setEditIdx(null); setInsertAfter(null); }}
          onSave={async (updated) => {
            setQuestions(updated); await onSave(updated);
            setEditIdx(null); setInsertAfter(null);
          }} />
      )}
      {importOpen && (
        <ImportModal idioma={survey.idioma} pais={survey.pais}
          onClose={() => setImportOpen(false)} onImport={handleImport}
          hasExisting={questions.length > 0} />
      )}
      {editIntro && (
        <IntroModal survey={survey} questions={questions} onClose={() => setEditIntro(false)}
          onSave={async (desc) => {
            try {
              const r = await fetch(`${import.meta.env.VITE_API_BASE ?? "/api"}/surveys/${survey.id}`,
                { method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ descripcion: desc }) });
              if (r.ok) setSurvey({ ...survey, descripcion: desc });
            } catch { setSurvey({ ...survey, descripcion: desc }); }
            setEditIntro(false);
          }} />
      )}
    </div>
  );
}

// ─── Modal de edición / nueva pregunta ────────────────────────────────────────

function NodeEditModal({ questions, editIdx, insertAfter, onClose, onSave }: {
  questions: EditQ[];
  editIdx: number | null;
  insertAfter: number | null;
  onClose: () => void;
  onSave: (updated: EditQ[]) => Promise<void>;
}) {
  const isNew = editIdx === null;
  const initial: EditQ = isNew
    ? { texto: "", tipo: "single", opciones: [], obligatoria: true, opcText: "", condiciones: [] }
    : { ...questions[editIdx!], opcText: questions[editIdx!].opciones.join(", ") };
  const [q, setQ] = useState<EditQ>(initial);
  const [saving, setSaving] = useState(false);

  const opts = NEEDS_OPTIONS.has(q.tipo)
    ? splitOpts(q.opcText ?? q.opciones.join(", "))
    : q.tipo === "yesno" ? ["Sí", "No"] : [];
  const hasConds = NEEDS_OPTIONS.has(q.tipo) || q.tipo === "yesno";

  const save = async () => {
    if (!q.texto.trim()) { alert("El texto de la pregunta no puede estar vacío."); return; }
    setSaving(true);
    let updated: EditQ[];
    if (isNew) {
      const pos = insertAfter === null ? 0 : insertAfter + 1;
      updated = [...questions.slice(0, pos), q, ...questions.slice(pos)];
    } else {
      updated = questions.map((x, i) => i === editIdx ? q : x);
    }
    await onSave(updated);
    setSaving(false);
  };

  const del = async () => {
    if (!confirm("¿Eliminar esta pregunta?")) return;
    setSaving(true);
    await onSave(questions.filter((_, i) => i !== editIdx));
    setSaving(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>
          {isNew ? `Nueva pregunta${insertAfter !== null ? ` (después de P${insertAfter + 1})` : ""}` : `Editar P${editIdx! + 1}`}
        </h2>

        <div><label>Texto</label>
          <textarea rows={3} value={q.texto} onChange={(e) => setQ({ ...q, texto: e.target.value })}
            placeholder="Texto de la pregunta" /></div>

        <div className="row" style={{ marginTop: "0.6rem" }}>
          <div style={{ flex: 2 }}><label>Tipo</label>
            <select value={q.tipo} onChange={(e) => setQ({ ...q, tipo: e.target.value, condiciones: [] })}>
              {Q_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select></div>
        </div>

        {NEEDS_OPTIONS.has(q.tipo) && (
          <div style={{ marginTop: "0.6rem" }}><label>Opciones (separadas por coma)</label>
            <input value={q.opcText ?? q.opciones.join(", ")}
              onChange={(e) => setQ({ ...q, opcText: e.target.value })}
              placeholder="Ej. Totalmente de acuerdo, De acuerdo, En desacuerdo" /></div>
        )}

        {/* Saltos condicionales */}
        {hasConds && (
          <div style={{ marginTop: "0.75rem", paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>
            <label style={{ display: "block", marginBottom: 6 }}>Saltos condicionales</label>
            {(q.condiciones ?? []).map((rule, ri) => (
              <div key={ri} className="row" style={{ gap: "0.4rem", marginBottom: 6, alignItems: "center" }}>
                <span className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>Si responde</span>
                <select style={{ flex: 1 }} value={rule.si_respuesta}
                  onChange={(e) => { const c = [...q.condiciones]; c[ri] = { ...c[ri], si_respuesta: e.target.value }; setQ({ ...q, condiciones: c }); }}>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <span className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>→ ir a</span>
                <select style={{ flex: 1 }} value={rule.ir_a_orden ?? "fin"}
                  onChange={(e) => { const c = [...q.condiciones]; c[ri] = { ...c[ri], ir_a_orden: e.target.value === "fin" ? null : +e.target.value }; setQ({ ...q, condiciones: c }); }}>
                  <option value="fin">Fin de encuesta</option>
                  {questions.map((_, j) => {
                    const myIdx = isNew ? (insertAfter !== null ? insertAfter + 1 : 0) : editIdx!;
                    return j > myIdx ? <option key={j} value={j}>P{j + 1}</option> : null;
                  })}
                </select>
                <button className="danger" style={{ padding: "0 0.4rem" }}
                  onClick={() => setQ({ ...q, condiciones: q.condiciones.filter((_, k) => k !== ri) })}>✕</button>
              </div>
            ))}
            <button className="secondary" style={{ fontSize: "0.8rem" }}
              onClick={() => setQ({ ...q, condiciones: [...q.condiciones, { si_respuesta: opts[0] ?? "Sí", ir_a_orden: null }] })}>
              + Añadir salto
            </button>
          </div>
        )}

        <div className="flex-between" style={{ marginTop: "1.25rem" }}>
          <div>
            {!isNew && <button className="danger" onClick={del} disabled={saving}>Eliminar</button>}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="secondary" onClick={onClose}>Cancelar</button>
            <button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Ejecución ────────────────────────────────────────────────────────────

function RunTab({ survey, surveyId, estado, progress, results, breakVar, setBreakVar,
  method, setMethod, N, setN, seg, setSeg, modelo, setModelo,
  previewN, regions, country, onLaunch, onCancel, questionsEmpty }: {
  survey: Survey; surveyId: number; estado: string; progress: { done: number; total: number } | null;
  results: SurveyResults | null; breakVar: string; setBreakVar: (v: string) => void;
  method: "representativa" | "aleatoria" | "segmento"; setMethod: (m: any) => void;
  N: number; setN: (n: number) => void;
  seg: any; setSeg: (s: any) => void;
  modelo: string; setModelo: (m: string) => void;
  previewN: number; regions: string[]; country: any;
  onLaunch: () => void; onCancel: () => void; questionsEmpty: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Configuración de muestra */}
      <div style={{ flex: "0 0 320px" }}>
        <div className="card">
          <h3>Muestra</h3>
          <div><label>Método</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="representativa">Representativa (cuotas edad×sexo, {country.fuenteDemografica})</option>
              <option value="aleatoria">Aleatoria simple</option>
              <option value="segmento">Segmento (filtros)</option>
            </select>
          </div>
          {method === "segmento" && (
            <>
              <div className="row" style={{ marginTop: 6 }}>
                <div><label>Región</label>
                  <select value={seg.region} onChange={(e) => setSeg({ ...seg, region: e.target.value })}>
                    <option value="">Todas</option>
                    {regions.sort().map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></div>
                <div><label>Sexo</label>
                  <select value={seg.genero} onChange={(e) => setSeg({ ...seg, genero: e.target.value })}>
                    <option value="">Ambos</option><option>Mujer</option><option>Hombre</option>
                  </select></div>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <div><label>Edad mín</label><input type="number" value={seg.edadMin} onChange={(e) => setSeg({ ...seg, edadMin: e.target.value })} /></div>
                <div><label>Edad máx</label><input type="number" value={seg.edadMax} onChange={(e) => setSeg({ ...seg, edadMax: e.target.value })} /></div>
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <div><label>Tamaño (N)</label>
              <input type="number" min={1} max={3000} value={N} onChange={(e) => setN(Math.max(1, +e.target.value || 1))} /></div>
            <div><label>Modelo IA</label>
              <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
                <option value="gpt-4o">GPT-4o (rápido)</option>
                <option value="gpt-5.5">GPT-5.5 (razonamiento)</option>
                <option disabled>──────────</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (≈ GPT-4o)</option>
                <option value="claude-opus-4-8">Claude Opus 4.8 (mayor calidad)</option>
              </select></div>
          </div>
          <p className="muted" style={{ margin: "8px 0" }}>Responderán ~{previewN} personas.</p>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button onClick={onLaunch} disabled={estado === "running" || questionsEmpty}>
              {estado === "running" ? "Ejecutando…" : "Lanzar encuesta"}
            </button>
            {estado === "running" && <button className="danger" onClick={onCancel}>Cancelar</button>}
          </div>
          {estado === "running" && progress && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: 8 }}>
              <span className="spinner blink" style={{ fontWeight: 500 }}>
                Ejecutando · {progress.done} / {progress.total}
              </span>
              {progress.total > 0 && <span className="muted" style={{ fontSize: "0.85rem" }}>
                ({Math.round((progress.done / progress.total) * 100)}%)
              </span>}
            </div>
          )}
          {survey.error_msg && <p style={{ color: "var(--danger)", marginTop: 6 }}>{survey.error_msg}</p>}
        </div>
      </div>

      {/* Resultados */}
      <div style={{ flex: "1 1 400px" }}>
        <div className="card">
          <div className="flex-between">
            <h3>Resultados {results ? `(${results.total_respuestas} resp.)` : ""}</h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <select value={breakVar} onChange={(e) => setBreakVar(e.target.value)}>
                {BREAKS.map((b) => <option key={b.v} value={b.v}>Cruce: {b.label}</option>)}
              </select>
              <a href={api.surveyExportPptxUrl(surveyId)}>
                <button className="secondary" disabled={estado !== "completed"}>↓ PowerPoint</button>
              </a>
            </div>
          </div>
          {estado === "running" ? (
            <p className="muted" style={{ padding: "1rem 0" }}>Los resultados se actualizan en tiempo real…</p>
          ) : !results ? (
            <p className="muted">Lanza la encuesta para ver los resultados.</p>
          ) : null}
          {results?.preguntas.map((q, ri) => (
            <div key={q.question_id} style={{ marginBottom: "1.25rem" }}>
              <p style={{ margin: "0 0 6px", fontWeight: 500 }}>
                <span style={{ color: "var(--accent-blue)", fontSize: "0.78rem", fontWeight: 600, marginRight: 6 }}>P{ri + 1}</span>
                {q.texto} <span className="muted" style={{ fontSize: "0.8rem" }}>({q.n} resp.)</span>
                {q.media != null && <span className="muted"> · media {q.media}</span>}
                {q.nps != null && <span className="muted"> · NPS {q.nps}</span>}
              </p>
              {q.tipo === "abierta" ? (
                <div className="verbatims">
                  {(q.textos ?? []).map((t, k) => <p className="verbatim" key={k}>"{t}"</p>)}
                  {(q.textos ?? []).length === 0 && <p className="muted">Sin respuestas.</p>}
                </div>
              ) : (
                <div className="bars">
                  {q.distribucion.map((o) => (
                    <div className="bar-row" key={o.opcion}>
                      <span className="bar-label" title={o.opcion}>{o.opcion}</span>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${o.pct}%` }} /></div>
                      <span className="bar-count">{o.n} · {o.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
              {results.break_var && Object.keys(q.cruce).length > 0 && (
                <div className="table-card" style={{ marginTop: 8 }}>
                  <table>
                    <thead><tr>
                      <th>{BREAKS.find((b) => b.v === results.break_var)?.label}</th>
                      {q.distribucion.map((o) => <th key={o.opcion}>{o.opcion}</th>)}
                    </tr></thead>
                    <tbody>
                      {Object.entries(q.cruce).map(([seg2, opts]) => (
                        <tr key={seg2}><td>{seg2}</td>
                          {opts.map((o) => <td key={o.opcion}>{o.pct}%</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Modal bienvenida/intro ───────────────────────────────────────────────────

function IntroModal({ survey, questions, onClose, onSave }: {
  survey: Survey; questions: EditQ[];
  onClose: () => void; onSave: (desc: string) => Promise<void>;
}) {
  const [desc, setDesc] = useState(survey.descripcion ?? "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const qSummary = questions.slice(0, 12).map((q, i) =>
        `P${i + 1}: ${q.texto || "(sin texto)"} [${q.tipo}]`).join("\n");
      const system = "Eres experto en investigación de mercados. Redactas textos de bienvenida para encuestas: breves, claros, sin preguntas, sin instrucciones de navegación.";
      const prompt = `Escribe un texto de bienvenida para esta encuesta.\n\nEncuesta: "${survey.nombre}"\nTema: ${survey.tema || "(sin tema)"}\n\nPreguntas (resumen):\n${qSummary}\n\nEl texto debe: presentar brevemente el objetivo, indicar que es anónima y el tiempo aproximado. Máximo 3 frases. Sin saludos redundantes. En español. Solo el texto, sin comillas ni markdown.`;
      const resp = await fetch(`${import.meta.env.VITE_API_BASE ?? "/api"}/surveys/generate-intro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, prompt }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setDesc(data.texto ?? "");
      } else {
        alert("No se pudo generar el texto. Inténtalo de nuevo.");
      }
    } catch { alert("Error al contactar con la IA."); }
    finally { setGenerating(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Texto de bienvenida</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Se mostrará al entrevistado antes de comenzar. Explica el objetivo, la duración estimada y que es anónima. Sin preguntas ni instrucciones de salto.
        </p>
        <div style={{ position: "relative" }}>
          <textarea rows={6} value={desc} onChange={(e) => setDesc(e.target.value)}
            style={{ paddingRight: "2.8rem" }}
            placeholder="Ej: Buenos días. Esta encuesta estudia las actitudes sobre la jubilación en España. Tardará unos 5 minutos. Sus respuestas son anónimas." />
          {/* Botón IA superpuesto arriba a la derecha del textarea */}
          <button
            onClick={generateWithAI}
            disabled={generating || questions.length === 0}
            title={questions.length === 0 ? "Añade preguntas primero" : "Generar con IA"}
            style={{
              position: "absolute", top: 8, right: 8,
              background: "var(--accent-blue)", color: "#fff",
              border: "none", borderRadius: 6, padding: "4px 8px",
              fontSize: "0.75rem", cursor: "pointer", lineHeight: 1.4,
              display: "flex", alignItems: "center", gap: 4,
              opacity: generating || questions.length === 0 ? 0.55 : 1,
            }}>
            {generating ? "…" : "✦ IA"}
          </button>
        </div>
        {generating && (
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>
            Generando introducción basada en tus preguntas…
          </p>
        )}
        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button disabled={saving} onClick={async () => { setSaving(true); await onSave(desc); setSaving(false); }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal importar PDF/Word ──────────────────────────────────────────────────

function ImportModal({ idioma, pais, onClose, onImport, hasExisting }: {
  idioma: string; pais: string; hasExisting: boolean;
  onClose: () => void; onImport: (draft: SurveyImportDraft) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<SurveyImportDraft | null>(null);
  const [err, setErr] = useState("");

  const analyze = async () => {
    if (!file) return;
    setLoading(true); setErr("");
    try { setDraft(await api.parseFileSurvey(file, idioma, pais)); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Importar cuestionario</h2>
        {!draft ? (
          <>
            {hasExisting && (
              <div style={{ background: "rgba(255,180,0,0.12)", border: "1px solid rgba(255,180,0,0.4)",
                            borderRadius: 6, padding: "0.65rem 0.85rem", marginBottom: "0.85rem",
                            fontSize: "0.88rem" }}>
                ⚠️ Al importar se reemplazarán las preguntas actuales de esta encuesta.
              </div>
            )}
            <p className="muted">Sube un PDF o Word. La IA lo convertirá a nuestro formato, incluyendo saltos condicionales si los detecta.</p>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "1.5rem", textAlign: "center", marginBottom: "1rem" }}>
              <input type="file" accept=".pdf,.docx,.doc" style={{ display: "block", margin: "0 auto" }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <p className="muted" style={{ marginTop: 8 }}>{file.name}</p>}
            </div>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
            <div className="flex-between">
              <button className="secondary" onClick={onClose}>Cancelar</button>
              <button onClick={analyze} disabled={!file || loading}>{loading ? "Analizando…" : "Analizar con IA"}</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Revisa el cuestionario extraído antes de cargarlo.</p>
            <div style={{ background: "var(--bg-2)", borderRadius: 6, padding: "0.75rem", marginBottom: "1rem" }}>
              <strong>{draft.nombre}</strong>{draft.tema && <span className="muted"> — {draft.tema}</span>}
            </div>
            <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {draft.preguntas.map((q, i) => (
                <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--accent-blue)", fontSize: "0.78rem", fontWeight: 600, marginRight: 6 }}>P{i + 1}</span>
                  <span style={{ fontWeight: 500 }}>{q.texto}</span>
                  <span className="tag" style={{ marginLeft: 6 }}>{q.tipo}</span>
                  {(q.opciones ?? []).length > 0 && <span className="muted" style={{ fontSize: "0.8rem", marginLeft: 6 }}>{q.opciones!.join(" · ")}</span>}
                  {(q.condiciones ?? []).length > 0 && (
                    <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                      {q.condiciones!.map((c, ci) => <span key={ci}> → Si "{c.si_respuesta}" → {c.ir_a_orden != null ? `P${c.ir_a_orden + 1}` : "Fin"}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex-between" style={{ marginTop: "1rem" }}>
              <button className="secondary" onClick={() => setDraft(null)}>← Volver a subir</button>
              <button onClick={() => onImport(draft)}>Cargar cuestionario</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
