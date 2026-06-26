import { useEffect, useRef, useState } from "react";
import { api, ConditionRule, Persona, QuestionIn, Survey, SurveyImportDraft, SurveyResults } from "../api/client";
import { useCountry } from "../CountryContext";
import { getCountry, Band } from "../countries";

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
type EditQ = QuestionIn & { opcText?: string; condiciones: ConditionRule[] };
const splitOpts = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const BREAKS = [
  { v: "", label: "Sin cruce" }, { v: "genero", label: "Sexo" }, { v: "edad", label: "Edad" },
  { v: "region", label: "Región" }, { v: "ingresos", label: "Ingresos" }, { v: "educacion", label: "Educación" },
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
function bandOf(edad: number | null | undefined, bands: Band[]): string | null {
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
  if (picked.length < N) {
    for (const p of shuffle(personas.filter((x) => !used.has(x.id))).slice(0, N - picked.length)) picked.push(p.id);
  }
  return picked.slice(0, N);
}

export default function SurveysPage() {
  const { pais, country } = useCountry();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const load = () => api.listSurveys().then(setSurveys).catch(console.error);
  useEffect(() => { load(); }, []);

  // Solo las encuestas del país seleccionado en la barra superior.
  const visibles = surveys.filter((s) => (s.pais || "ES") === pais);

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
        <div><label>País (del escenario)</label>
          <input value={country.nombre} disabled title="Se cambia con el selector de país de la barra superior" /></div>
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
  const [importOpen, setImportOpen] = useState(false);
  const pollRef = useRef<number | null>(null);
  const breakVarRef = useRef("");
  useEffect(() => { breakVarRef.current = breakVar; }, [breakVar]);

  useEffect(() => {
    api.getSurvey(id).then((s) => {
      setSurvey(s); setEstado(s.estado);
      setQuestions(s.questions.map((q) => ({ texto: q.texto, tipo: q.tipo, opciones: q.opciones, obligatoria: q.obligatoria, opcText: q.opciones.join(", "), condiciones: q.condiciones ?? [] })));
      setModelo(s.modelo || "gpt-4o");
      // Solo personas del país de la encuesta (la muestra se toma de ahí).
      api.listPersonas(undefined, s.pais).then(setPersonas);
      if (s.estado === "completed") loadResults("");
    });
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
  const country = getCountry(survey?.pais);
  const sampleIds = (): number[] => {
    if (method === "representativa") return quotaSample(personas, N, country.pyramidBands);
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
        condiciones: q.condiciones ?? [],
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
        // Refresco en vivo: actualiza gráficos a medida que entran respuestas.
        if (st.respondidas > 0) loadResults(breakVarRef.current);
        if (st.estado !== "running" && pollRef.current) {
          window.clearInterval(pollRef.current); pollRef.current = null;
          loadResults(breakVarRef.current);
        }
      }, 2000);
    } catch (e) { alert("Error: " + (e as Error).message); setEstado("draft"); }
  };

  const addQ = () => setQuestions([...questions, { texto: "", tipo: "single", opciones: [], obligatoria: true, opcText: "", condiciones: [] }]);
  const updQ = (i: number, patch: Partial<EditQ>) => setQuestions(questions.map((q, j) => j === i ? { ...q, ...patch } : q));
  const rmQ = (i: number) => setQuestions(questions.filter((_, j) => j !== i));

  if (!survey) return <div className="loading-center"><span className="spinner blink">Cargando…</span></div>;

  return (
    <div className="w80">
      {importOpen && (
        <ImportModal
          idioma={survey.idioma}
          pais={survey.pais}
          onClose={() => setImportOpen(false)}
          onImport={(draft) => {
            setQuestions(draft.preguntas.map((q, i) => ({
              texto: q.texto, tipo: q.tipo, opciones: q.opciones ?? [],
              obligatoria: q.obligatoria ?? true,
              opcText: (q.opciones ?? []).join(", "),
              condiciones: (q.condiciones ?? []) as ConditionRule[],
            })));
            setImportOpen(false);
          }}
        />
      )}
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
            <div className="flex-between">
              <h3>Cuestionario</h3>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="secondary" onClick={() => setImportOpen(true)}>↑ Importar PDF/Word</button>
                <button className="secondary" onClick={addQ}>+ Pregunta</button>
              </div>
            </div>
            {questions.map((q, i) => {
              const opts = NEEDS_OPTIONS.has(q.tipo) ? splitOpts(q.opcText ?? q.opciones.join(", ")) : (q.tipo === "yesno" ? ["Sí", "No"] : []);
              const hasConds = NEEDS_OPTIONS.has(q.tipo) || q.tipo === "yesno";
              return (
                <div key={i} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.78rem", color: "var(--accent-blue)", marginBottom: 4 }}>P{i + 1}</div>
                  <textarea rows={2} placeholder="Texto de la pregunta" value={q.texto}
                    onChange={(e) => updQ(i, { texto: e.target.value })} />
                  <div className="row" style={{ marginTop: 6 }}>
                    <select value={q.tipo} onChange={(e) => updQ(i, { tipo: e.target.value, condiciones: [] })}>
                      {Q_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                    </select>
                    <button className="danger" style={{ flex: "0 0 auto" }} onClick={() => rmQ(i)}>✕</button>
                  </div>
                  {NEEDS_OPTIONS.has(q.tipo) && (
                    <input style={{ marginTop: 6 }} placeholder="Opciones separadas por coma"
                      value={q.opcText ?? q.opciones.join(", ")}
                      onChange={(e) => updQ(i, { opcText: e.target.value })} />
                  )}
                  {q.tipo === "abierta" && (
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.8rem" }}>
                      Respuesta de texto libre; cada persona contesta con sus palabras.
                    </p>
                  )}
                  {/* Branching / skip logic */}
                  {hasConds && (
                    <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
                      {(q.condiciones ?? []).map((rule, ri) => (
                        <div key={ri} className="row" style={{ gap: "0.4rem", marginBottom: 4, alignItems: "center" }}>
                          <span className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>Si responde</span>
                          <select style={{ flex: 1 }} value={rule.si_respuesta}
                            onChange={(e) => { const c = [...(q.condiciones ?? [])]; c[ri] = { ...c[ri], si_respuesta: e.target.value }; updQ(i, { condiciones: c }); }}>
                            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <span className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>→ saltar a</span>
                          <select style={{ flex: 1 }} value={rule.ir_a_orden ?? "fin"}
                            onChange={(e) => { const c = [...(q.condiciones ?? [])]; c[ri] = { ...c[ri], ir_a_orden: e.target.value === "fin" ? null : +e.target.value }; updQ(i, { condiciones: c }); }}>
                            <option value="fin">Fin de encuesta</option>
                            {questions.map((_, j) => j > i ? <option key={j} value={j}>P{j + 1}</option> : null)}
                          </select>
                          <button className="danger" style={{ flex: "0 0 auto", padding: "0 0.4rem" }}
                            onClick={() => { const c = (q.condiciones ?? []).filter((_, k) => k !== ri); updQ(i, { condiciones: c }); }}>✕</button>
                        </div>
                      ))}
                      <button className="secondary" style={{ fontSize: "0.78rem", marginTop: 2 }}
                        onClick={() => updQ(i, { condiciones: [...(q.condiciones ?? []), { si_respuesta: opts[0] ?? "Sí", ir_a_orden: null }] })}>
                        + Salto condicional
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {questions.length === 0 && <p className="muted">Añade la primera pregunta o importa desde un PDF/Word.</p>}
            <button onClick={saveQuestions} disabled={saving}>{saving ? "Guardando…" : "Guardar cuestionario"}</button>
          </div>

          <div className="card">
            <h3>Muestra</h3>
            <div><label>Método</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                <option value="representativa">Representativa (cuotas edad×sexo, {country.fuenteDemografica})</option>
                <option value="aleatoria">Aleatoria simple</option>
                <option value="segmento">Segmento (filtros)</option>
              </select>
            </div>
            {method === "segmento" && (
              <div className="row" style={{ marginTop: 6 }}>
                <div><label>Región</label>
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

function ImportModal({
  idioma, pais, onClose, onImport,
}: {
  idioma: string; pais: string;
  onClose: () => void;
  onImport: (draft: SurveyImportDraft) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<SurveyImportDraft | null>(null);
  const [err, setErr] = useState("");

  const analyze = async () => {
    if (!file) return;
    setLoading(true); setErr("");
    try {
      const d = await api.parseFileSurvey(file, idioma, pais);
      setDraft(d);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Importar cuestionario</h2>
        {!draft ? (
          <>
            <p className="muted">Sube un PDF o Word con tu cuestionario. La IA lo convertirá a nuestro formato para que lo revises antes de guardar.</p>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: "1.5rem", textAlign: "center", marginBottom: "1rem" }}>
              <input type="file" accept=".pdf,.docx,.doc" style={{ display: "block", margin: "0 auto" }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <p className="muted" style={{ marginTop: 8 }}>{file.name}</p>}
            </div>
            {err && <p style={{ color: "var(--danger)" }}>{err}</p>}
            <div className="flex-between">
              <button className="secondary" onClick={onClose}>Cancelar</button>
              <button onClick={analyze} disabled={!file || loading}>
                {loading ? "Analizando…" : "Analizar con IA"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Revisa y ajusta el cuestionario extraído antes de cargarlo.</p>
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
                  {(q.condiciones ?? []).length > 0 && <div className="muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>
                    {q.condiciones!.map((c, ci) => <span key={ci}> → Si "{c.si_respuesta}" → {c.ir_a_orden != null ? `P${c.ir_a_orden + 1}` : "Fin"}</span>)}
                  </div>}
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
