import { useEffect, useRef, useState } from "react";
import { api, Persona, QuestionIn, Survey, SurveyResults } from "../api/client";

const Q_TYPES = [
  { v: "single", label: "Opción única" },
  { v: "multiple", label: "Opción múltiple" },
  { v: "yesno", label: "Sí / No" },
  { v: "likert", label: "Escala 1–5" },
  { v: "nps", label: "NPS 0–10" },
  { v: "abierta", label: "Pregunta abierta" },
];
const NEEDS_OPTIONS = new Set(["single", "multiple"]);

// Pregunta en edición: guarda el texto crudo de opciones para no reformatear al teclear.
type EditQ = QuestionIn & { opcText?: string };
const splitOpts = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

// Pirámide INE adultos 18+: [banda, min, max, % adultos, % mujeres]
const BANDS: [string, number, number, number, number][] = [
  ["18-24", 18, 24, 0.08, 0.49], ["25-34", 25, 34, 0.14, 0.49], ["35-44", 35, 44, 0.18, 0.49],
  ["45-54", 45, 54, 0.19, 0.50], ["55-64", 55, 64, 0.17, 0.51], ["65-74", 65, 74, 0.13, 0.53],
  ["75-84", 75, 84, 0.08, 0.58], ["85+", 85, 200, 0.03, 0.67],
];
const BREAKS = [
  { v: "", label: "Sin cruce" }, { v: "genero", label: "Sexo" }, { v: "edad", label: "Edad" },
  { v: "region", label: "Comunidad" }, { v: "ingresos", label: "Ingresos" }, { v: "educacion", label: "Educación" },
];

function normGen(g?: string | null): string {
  const s = (g ?? "").toLowerCase();
  if (s.startsWith("muj") || s.startsWith("fem")) return "Mujer";
  if (s.startsWith("hom") || s.startsWith("masc") || s.startsWith("var")) return "Hombre";
  return "Otro";
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function bandOf(edad?: number | null): string | null {
  if (edad == null) return null;
  for (const [l, lo, hi] of BANDS) if (edad >= lo && edad <= hi) return l;
  return null;
}
function quotaSample(personas: Persona[], N: number): number[] {
  const byCell: Record<string, Persona[]> = {};
  for (const p of personas) {
    const sd = p.sociodemografico ?? {};
    const b = bandOf(sd.edad); const g = normGen(sd.genero);
    if (b && (g === "Mujer" || g === "Hombre")) (byCell[`${b}|${g}`] ||= []).push(p);
  }
  const picked: number[] = []; const used = new Set<number>();
  for (const [band, , , share, fem] of BANDS) {
    for (const [g, prop] of [["Mujer", fem], ["Hombre", 1 - fem]] as [string, number][]) {
      const pool = shuffle([...(byCell[`${band}|${g}`] ?? [])]);
      for (const p of pool.slice(0, Math.round(N * share * prop))) { picked.push(p.id); used.add(p.id); }
    }
  }
  if (picked.length < N) {
    for (const p of shuffle(personas.filter((x) => !used.has(x.id))).slice(0, N - picked.length)) picked.push(p.id);
  }
  return picked.slice(0, N);
}

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const load = () => api.listSurveys().then(setSurveys).catch(console.error);
  useEffect(() => { load(); }, []);

  if (selectedId !== null) {
    return <SurveyDetail id={selectedId} onBack={() => { setSelectedId(null); load(); }} />;
  }
  return (
    <div className="w80">
      <div className="toolbar">
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>Encuestas</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCreating(true)}>+ Nueva encuesta</button>
      </div>
      <p className="muted" style={{ marginTop: "-0.5rem" }}>
        Encuestas cuantitativas sobre la población sintética. Resultados simulados por IA: exploran
        hipótesis, no sustituyen una encuesta real.
      </p>
      <div className="card table-card">
        <table>
          <thead><tr><th>Nombre</th><th>Tema</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {surveys.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.nombre}</strong></td>
                <td>{s.tema}</td>
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
            {surveys.length === 0 && <tr><td colSpan={4} className="muted">Aún no hay encuestas.</td></tr>}
          </tbody>
        </table>
      </div>
      {creating && <CreateModal onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); load(); setSelectedId(id); }} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [f, setF] = useState({ nombre: "", tema: "", idioma: "es" });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nueva encuesta</h2>
        <div><label>Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label>Tema</label><input value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} /></div>
        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button disabled={!f.nombre} onClick={async () => onCreated((await api.createSurvey(f)).id)}>Crear</button>
        </div>
      </div>
    </div>
  );
}

function SurveyDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [questions, setQuestions] = useState<EditQ[]>([]);
  const [method, setMethod] = useState<"representativa" | "aleatoria" | "segmento">("representativa");
  const [N, setN] = useState(200);
  const [seg, setSeg] = useState({ region: "", genero: "", edadMin: "", edadMax: "" });
  const [modelo, setModelo] = useState("gpt-4o");
  const [estado, setEstado] = useState("draft");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [breakVar, setBreakVar] = useState("");
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [saving, setSaving] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    api.getSurvey(id).then((s) => {
      setSurvey(s); setEstado(s.estado);
      setQuestions(s.questions.map((q) => ({ texto: q.texto, tipo: q.tipo, opciones: q.opciones, obligatoria: q.obligatoria, opcText: q.opciones.join(", ") })));
      setModelo(s.modelo || "gpt-4o");
      if (s.estado === "completed") loadResults("");
    });
    api.listPersonas().then(setPersonas);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [id]);

  const eligible = personas.filter((p) => {
    const sd = p.sociodemografico ?? {};
    if (seg.region && sd.region !== seg.region) return false;
    if (seg.genero && normGen(sd.genero) !== seg.genero) return false;
    if (seg.edadMin && (sd.edad == null || sd.edad < +seg.edadMin)) return false;
    if (seg.edadMax && (sd.edad == null || sd.edad > +seg.edadMax)) return false;
    return true;
  });
  const sampleIds = (): number[] => {
    if (method === "representativa") return quotaSample(personas, N);
    const pool = method === "segmento" ? eligible : personas;
    return shuffle([...pool]).slice(0, N).map((p) => p.id);
  };
  const previewN = method === "segmento" ? Math.min(N, eligible.length) : Math.min(N, personas.length);
  const regions = Array.from(new Set(personas.map((p) => p.sociodemografico?.region).filter(Boolean))) as string[];

  const saveQuestions = async () => {
    setSaving(true);
    try {
      const payload: QuestionIn[] = questions.map((q) => ({
        texto: q.texto,
        tipo: q.tipo,
        obligatoria: q.obligatoria,
        opciones: NEEDS_OPTIONS.has(q.tipo) ? splitOpts(q.opcText ?? q.opciones.join(", ")) : [],
      }));
      setSurvey(await api.setSurveyQuestions(id, payload));
    } finally { setSaving(false); }
  };
  const loadResults = (bv: string) => api.surveyResults(id, bv).then(setResults).catch(() => {});

  const launch = async () => {
    await saveQuestions();
    const ids = sampleIds();
    if (!ids.length) { alert("La muestra está vacía."); return; }
    setEstado("running"); setProgress({ done: 0, total: ids.length }); setResults(null);
    try {
      await api.launchSurvey(id, ids, modelo, modelo.startsWith("gpt-5") ? "high" : null);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        const st = await api.surveyStatus(id);
        setEstado(st.estado); setProgress({ done: st.respondidas, total: ids.length });
        if (st.estado !== "running" && pollRef.current) {
          window.clearInterval(pollRef.current); pollRef.current = null;
          loadResults(breakVar);
        }
      }, 2000);
    } catch (e) { alert("Error: " + (e as Error).message); setEstado("draft"); }
  };

  const addQ = () => setQuestions([...questions, { texto: "", tipo: "single", opciones: [], obligatoria: true, opcText: "" }]);
  const updQ = (i: number, patch: Partial<EditQ>) => setQuestions(questions.map((q, j) => j === i ? { ...q, ...patch } : q));
  const rmQ = (i: number) => setQuestions(questions.filter((_, j) => j !== i));

  if (!survey) return <div className="loading-center"><span className="spinner blink">Cargando…</span></div>;

  return (
    <div className="w80">
      <div className="toolbar" style={{ position: "relative", alignItems: "center" }}>
        <button className="secondary" onClick={onBack}
          style={{ position: "absolute", left: "-7.5rem", top: "50%", transform: "translateY(-50%)" }}>← Volver</button>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>{survey.nombre}</h2>
        <div style={{ flex: 1 }} />
        <a href={api.surveyExportUrl(id)}><button className="secondary" disabled={estado !== "completed"}>Excel</button></a>
      </div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Constructor + muestra */}
        <div style={{ flex: "1 1 360px", maxWidth: 460 }}>
          <div className="card">
            <div className="flex-between"><h3>Cuestionario</h3><button className="secondary" onClick={addQ}>+ Pregunta</button></div>
            {questions.map((q, i) => (
              <div key={i} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 8 }}>
                <textarea rows={2} placeholder="Texto de la pregunta" value={q.texto}
                  onChange={(e) => updQ(i, { texto: e.target.value })} />
                <div className="row" style={{ marginTop: 6 }}>
                  <select value={q.tipo} onChange={(e) => updQ(i, { tipo: e.target.value })}>
                    {Q_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                  <button className="danger" style={{ flex: "0 0 auto" }} onClick={() => rmQ(i)}>✕</button>
                </div>
                {NEEDS_OPTIONS.has(q.tipo) && (
                  <input style={{ marginTop: 6 }} placeholder="Opciones separadas por coma (p. ej. Real Madrid, Barça, Atlético)"
                    value={q.opcText ?? q.opciones.join(", ")}
                    onChange={(e) => updQ(i, { opcText: e.target.value })} />
                )}
                {q.tipo === "abierta" && (
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
                    Respuesta de texto libre; cada persona contesta con sus palabras.
                  </p>
                )}
              </div>
            ))}
            {questions.length === 0 && <p className="muted">Añade la primera pregunta.</p>}
            <button onClick={saveQuestions} disabled={saving}>{saving ? "Guardando…" : "Guardar cuestionario"}</button>
          </div>

          <div className="card">
            <h3>Muestra</h3>
            <div><label>Método</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="representativa">Representativa (cuotas edad×sexo, INE)</option>
                <option value="aleatoria">Aleatoria simple</option>
                <option value="segmento">Segmento (filtros)</option>
              </select>
            </div>
            {method === "segmento" && (
              <div className="row" style={{ marginTop: 6 }}>
                <div><label>Comunidad</label>
                  <select value={seg.region} onChange={(e) => setSeg({ ...seg, region: e.target.value })}>
                    <option value="">Todas</option>
                    {regions.sort().map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></div>
                <div><label>Sexo</label>
                  <select value={seg.genero} onChange={(e) => setSeg({ ...seg, genero: e.target.value })}>
                    <option value="">Ambos</option><option value="Mujer">Mujer</option><option value="Hombre">Hombre</option>
                  </select></div>
              </div>
            )}
            {method === "segmento" && (
              <div className="row" style={{ marginTop: 6 }}>
                <div><label>Edad mín</label><input type="number" value={seg.edadMin} onChange={(e) => setSeg({ ...seg, edadMin: e.target.value })} /></div>
                <div><label>Edad máx</label><input type="number" value={seg.edadMax} onChange={(e) => setSeg({ ...seg, edadMax: e.target.value })} /></div>
              </div>
            )}
            <div className="row" style={{ marginTop: 6 }}>
              <div><label>Tamaño (N)</label><input type="number" min={1} max={3000} value={N} onChange={(e) => setN(Math.max(1, +e.target.value || 1))} /></div>
              <div><label>Modelo IA</label>
                <select value={modelo} onChange={(e) => setModelo(e.target.value)}>
                  <option value="gpt-4o">GPT-4o (rápido)</option>
                  <option value="gpt-5.5">GPT-5.5 (razonamiento)</option>
                </select></div>
            </div>
            <p className="muted" style={{ margin: "6px 0" }}>Responderán ~{previewN} personas.</p>
            <button onClick={launch} disabled={estado === "running" || questions.length === 0}>
              {estado === "running" ? "Ejecutando…" : "Lanzar encuesta"}
            </button>
            {estado === "running" && progress && (
              <p className="spinner" style={{ marginTop: 6 }}>{progress.done}/{progress.total} respondidas…</p>
            )}
            {survey.error_msg && <p style={{ color: "var(--danger)" }}>{survey.error_msg}</p>}
          </div>
        </div>

        {/* Resultados */}
        <div style={{ flex: "2 1 520px" }}>
          <div className="card">
            <div className="flex-between">
              <h3>Resultados {results ? `(${results.total_respuestas})` : ""}</h3>
              <select value={breakVar} onChange={(e) => { setBreakVar(e.target.value); loadResults(e.target.value); }}>
                {BREAKS.map((b) => <option key={b.v} value={b.v}>Cruce: {b.label}</option>)}
              </select>
            </div>
            {!results && <p className="muted">Lanza la encuesta para ver los resultados.</p>}
            {results?.preguntas.map((q) => (
              <div key={q.question_id} style={{ marginBottom: "1.25rem" }}>
                <p style={{ margin: "0 0 6px", fontWeight: 500 }}>{q.texto}
                  {q.media != null && <span className="muted"> · media {q.media}</span>}
                  {q.nps != null && <span className="muted"> · NPS {q.nps}</span>}
                </p>
                {q.tipo === "abierta" ? (
                  <div className="verbatims">
                    {(q.textos ?? []).map((t, k) => (
                      <p className="verbatim" key={k}>“{t}”</p>
                    ))}
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
                      <thead><tr><th>{BREAKS.find((b) => b.v === results.break_var)?.label}</th>
                        {q.distribucion.map((o) => <th key={o.opcion}>{o.opcion}</th>)}</tr></thead>
                      <tbody>
                        {Object.entries(q.cruce).map(([seg2, opts]) => (
                          <tr key={seg2}><td>{seg2}</td>
                            {opts.map((o) => <td key={o.opcion}>{o.pct}%</td>)}</tr>
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
    </div>
  );
}
