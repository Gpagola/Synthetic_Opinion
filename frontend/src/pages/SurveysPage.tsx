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
        <a href={api.surveyExportUrl(id)}>
          <button className="secondary" disabled={estado !== "completed"}>↓ Excel</button>
        </a>
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

  const openEdit = (idx: number) => { setInsertAfter(null); setEditIdx(idx); };
  const openInsert = (after: number | null) => { setInsertAfter(after); setEditIdx(null); };

  const handleImport = (draft: SurveyImportDraft) => {
    const qs: EditQ[] = draft.preguntas.map((q) => ({
      texto: q.texto, tipo: q.tipo, opciones: q.opciones ?? [],
      obligatoria: q.obligatoria ?? true,
      opcText: (q.opciones ?? []).join(", "),
      condiciones: (q.condiciones ?? []) as ConditionRule[],
    }));
    setQuestions(qs);
    setImportOpen(false);
  };

  return (
    <div>
      {/* Barra de acciones del diseño */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="secondary" onClick={() => {
          if (questions.length > 0 && !confirm("¿Importar? Se reemplazarán las preguntas actuales.")) return;
          setImportOpen(true);
        }}>↑ Importar PDF/Word</button>
        <button className="secondary" onClick={() => openInsert(questions.length - 1)}>+ Añadir pregunta</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => onSave()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cuestionario"}
        </button>
      </div>

      {/* Grafo de flujo */}
      <div className="card" style={{ padding: "1.25rem 0.75rem", overflowX: "auto" }}>
        {questions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">Aún no hay preguntas.</p>
            <button className="secondary" onClick={() => openInsert(null)}>+ Añadir la primera pregunta</button>
          </div>
        ) : (
          <QuestionGraph
            questions={questions}
            onClickNode={openEdit}
            onClickInsert={openInsert}
            intro={survey.descripcion ?? ""}
            onEditIntro={() => setEditIntro(true)}
          />
        )}
      </div>

      {/* Modal de edición / nueva pregunta */}
      {(editIdx !== null || insertAfter !== null) && (
        <NodeEditModal
          questions={questions}
          editIdx={editIdx}
          insertAfter={insertAfter}
          onClose={() => { setEditIdx(null); setInsertAfter(null); }}
          onSave={async (updated) => {
            setQuestions(updated);
            await onSave(updated);
            setEditIdx(null); setInsertAfter(null);
          }}
        />
      )}

      {/* Modal importador */}
      {importOpen && (
        <ImportModal
          idioma={survey.idioma}
          pais={survey.pais}
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
          hasExisting={questions.length > 0}
        />
      )}

      {/* Modal intro/bienvenida */}
      {editIntro && (
        <IntroModal
          survey={survey}
          onClose={() => setEditIntro(false)}
          onSave={async (desc) => {
            const updated = await api.createSurvey({ nombre: survey.nombre, tema: survey.tema,
              descripcion: desc, idioma: survey.idioma, pais: survey.pais }).catch(() => null);
            // La API no tiene PATCH para descripcion sola, usamos el endpoint de actualización
            // a través de una llamada directa al backend
            try {
              const r = await fetch(`${import.meta.env.VITE_API_BASE ?? "/api"}/surveys/${survey.id}`,
                { method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ descripcion: desc }) });
              if (r.ok) setSurvey({ ...survey, descripcion: desc });
            } catch {
              setSurvey({ ...survey, descripcion: desc });
            }
            setEditIntro(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Grafo de preguntas ────────────────────────────────────────────────────────

const NW = 164, NH = 86, GAP = 56, ROW_Y = 100, ARC_H = 42;

function QuestionGraph({ questions, onClickNode, onClickInsert, intro, onEditIntro }: {
  questions: EditQ[];
  onClickNode: (i: number) => void;
  onClickInsert: (after: number | null) => void;
  intro: string;
  onEditIntro: () => void;
}) {
  const n = questions.length;
  const INTRO_W = 148;
  const OFFSET = INTRO_W + GAP * 2; // espacio para el nodo de bienvenida
  const totalW = OFFSET + n * (NW + GAP) + GAP + 48;
  const svgH = ROW_Y + NH + ARC_H + 24;

  // Posición X del centro de cada nodo de pregunta
  const cx = (i: number) => OFFSET + GAP + i * (NW + GAP) + NW / 2;

  // Construir flechas
  type Arrow = { from: number; to: number | null; label: string; isSkip: boolean };
  const arrows: Arrow[] = [];
  for (let i = 0; i < n; i++) {
    const q = questions[i];
    // Flecha normal al siguiente (si no hay condición que cubra TODAS las opciones → siguiente siempre)
    const hasFinCond = (q.condiciones ?? []).some((c) => c.ir_a_orden === null);
    if (!hasFinCond && i < n - 1)
      arrows.push({ from: i, to: i + 1, label: "", isSkip: false });
    // Flechas de condición
    for (const cond of (q.condiciones ?? [])) {
      const label = `Si "${cond.si_respuesta}"`;
      if (cond.ir_a_orden === null) {
        arrows.push({ from: i, to: null, label, isSkip: true });
      } else {
        const target = cond.ir_a_orden; // ir_a_orden = orden del destino = índice
        if (target !== i + 1)
          arrows.push({ from: i, to: target, label, isSkip: true });
      }
    }
  }

  const nodeY = ROW_Y;

  return (
    <div style={{ position: "relative", minWidth: totalW, height: svgH + 32 }}>
      {/* SVG para flechas */}
      <svg width={totalW} height={svgH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}>
        <defs>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)" />
          </marker>
          <marker id="arrs" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="var(--accent-blue)" />
          </marker>
        </defs>
        {arrows.map((a, ai) => {
          const x1 = cx(a.from) + NW / 2;
          const y1 = nodeY + NH / 2;
          if (a.to === null) {
            // Flecha hacia abajo (fin)
            return (
              <g key={ai}>
                <line x1={x1} y1={nodeY + NH} x2={x1} y2={nodeY + NH + 30}
                  stroke="var(--accent-blue)" strokeWidth={1.5} strokeDasharray="4 3"
                  markerEnd="url(#arrs)" />
                <text x={x1 + 4} y={nodeY + NH + 24} fontSize={9} fill="var(--accent-blue)" opacity={0.85}>{a.label} → FIN</text>
              </g>
            );
          }
          const x2 = cx(a.to) - NW / 2;
          const y2 = nodeY + NH / 2;
          if (!a.isSkip) {
            // Flecha horizontal simple
            return (
              <line key={ai} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#arr)" />
            );
          }
          // Arco Bézier sobre los nodos
          const mx = (x1 + x2) / 2;
          const my = nodeY - ARC_H - Math.abs(a.to - a.from) * 8;
          return (
            <g key={ai}>
              <path d={`M${x1},${nodeY} C${x1},${my} ${x2},${my} ${x2},${nodeY}`}
                stroke="var(--accent-blue)" strokeWidth={1.5} strokeDasharray="5 3"
                fill="none" markerEnd="url(#arrs)" />
              <text x={mx} y={my - 4} textAnchor="middle" fontSize={9} fill="var(--accent-blue)" opacity={0.9}>{a.label}</text>
            </g>
          );
        })}
      </svg>

      {/* Nodo de bienvenida */}
      <div onClick={onEditIntro} className="graph-node graph-node-welcome"
        style={{ left: GAP, top: ROW_Y, width: INTRO_W, height: NH, position: "absolute" }}
        title="Clic para editar la introducción">
        <div className="graph-node-head">
          <span className="graph-pnum" style={{ color: "var(--accent-blue)" }}>✦</span>
          <span className="graph-type">Bienvenida</span>
        </div>
        <div className="graph-node-body" style={{ fontStyle: intro ? "normal" : "italic", color: intro ? undefined : "var(--muted)" }}>
          {intro || "Añadir introducción…"}
        </div>
      </div>
      {/* Flecha de bienvenida → P1 */}
      {n > 0 && (
        <svg width={totalW} height={svgH}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}>
          <defs>
            <marker id="arr0" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--muted)" />
            </marker>
          </defs>
          <line x1={GAP + INTRO_W} y1={ROW_Y + NH / 2}
                x2={OFFSET + GAP} y2={ROW_Y + NH / 2}
                stroke="var(--muted)" strokeWidth={1.5} markerEnd="url(#arr0)" />
        </svg>
      )}

      {/* Nodos de pregunta */}
      {questions.map((q, i) => {
        const x = GAP + i * (NW + GAP);
        const typeLbl = Q_TYPES.find((t) => t.v === q.tipo)?.label ?? q.tipo;
        return (
          <div key={i} onClick={() => onClickNode(i)}
            className="graph-node"
            style={{ left: x, top: nodeY, width: NW, height: NH, position: "absolute" }}
            title="Clic para editar">
            <div className="graph-node-head">
              <span className="graph-pnum">P{i + 1}</span>
              <span className="graph-type">{typeLbl}</span>
              {(q.condiciones ?? []).length > 0 && <span title="Tiene saltos condicionales" style={{ marginLeft: "auto" }}>⤵</span>}
            </div>
            <div className="graph-node-body">
              {q.texto || <span className="muted" style={{ fontStyle: "italic" }}>Sin texto</span>}
            </div>
          </div>
        );
      })}

      {/* Botones "+" entre nodos y al final */}
      {questions.map((_, i) => (
        <button key={`ins-${i}`} className="graph-insert-btn"
          style={{ left: GAP + i * (NW + GAP) - 14, top: nodeY + NH / 2 - 10, position: "absolute" }}
          onClick={(e) => { e.stopPropagation(); onClickInsert(i - 1); }}
          title={`Insertar antes de P${i + 1}`}>+</button>
      ))}
      <button className="graph-insert-btn"
        style={{ left: GAP + n * (NW + GAP), top: nodeY + NH / 2 - 10, position: "absolute" }}
        onClick={() => onClickInsert(n - 1)}
        title="Añadir pregunta al final">+</button>
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

function RunTab({ survey, estado, progress, results, breakVar, setBreakVar,
  method, setMethod, N, setN, seg, setSeg, modelo, setModelo,
  previewN, regions, country, onLaunch, onCancel, questionsEmpty }: {
  survey: Survey; estado: string; progress: { done: number; total: number } | null;
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
            <select value={breakVar} onChange={(e) => setBreakVar(e.target.value)}>
              {BREAKS.map((b) => <option key={b.v} value={b.v}>Cruce: {b.label}</option>)}
            </select>
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

function IntroModal({ survey, onClose, onSave }: {
  survey: Survey; onClose: () => void; onSave: (desc: string) => Promise<void>;
}) {
  const [desc, setDesc] = useState(survey.descripcion ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Texto de bienvenida</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Se mostrará al entrevistado antes de comenzar. Explica el objetivo de la encuesta, la duración estimada y cualquier contexto necesario. Sin preguntas ni instrucciones de salto.
        </p>
        <textarea rows={6} value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="Ej: Buenos días. Esta encuesta estudia las actitudes sobre la jubilación en España. Tardará unos 5 minutos. Sus respuestas son anónimas." />
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
