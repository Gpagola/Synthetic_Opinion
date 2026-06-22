import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { api, Candidate, FocusGroup, Persona, QuestionItem, Report } from "../api/client";
import { useCountry } from "../CountryContext";
import { getCountry } from "../countries";

export default function FocusGroupsPage() {
  const { pais, country } = useCountry();
  const [groups, setGroups] = useState<FocusGroup[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => api.listFocusGroups().then(setGroups).catch(console.error);
  useEffect(() => { load(); }, []);

  // Solo los focus groups del país seleccionado en la barra superior.
  const visibles = groups.filter((g) => (g.pais || "ES") === pais);

  const borrar = async (g: FocusGroup) => {
    if (!confirm(`¿Borrar el focus group "${g.nombre}"? Se eliminará su chat e informes. Las personas no se borran.`)) return;
    setGroups((prev) => prev.filter((x) => x.id !== g.id)); // optimista
    try {
      await api.deleteFocusGroup(g.id);
    } catch (e) {
      alert("Error: " + (e as Error).message);
      load(); // revertir si falló
    }
  };

  if (selectedId !== null) {
    return (
      <FocusGroupDetail
        id={selectedId}
        onBack={() => { setSelectedId(null); load(); }}
      />
    );
  }

  return (
    <div className="w80">
      <div className="toolbar">
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>Focus Groups</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCreating(true)}>+ Nuevo focus group</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Tema</th><th>País</th><th>Idioma</th><th></th></tr>
          </thead>
          <tbody>
            {visibles.map((g) => (
              <tr key={g.id}>
                <td><strong>{g.nombre}</strong></td>
                <td>{g.tema}</td>
                <td>{getCountry(g.pais).nombre}</td>
                <td>{g.idioma}</td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <button className="secondary" onClick={() => setSelectedId(g.id)}>Abrir chat</button>{" "}
                  <button className="danger" onClick={() => borrar(g)}>Borrar</button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={5} className="muted">No hay focus groups en {country.nombre} todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); load(); setSelectedId(id); }}
        />
      )}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { pais, country } = useCountry();
  const [f, setF] = useState({ nombre: "", tema: "", descripcion: "", idioma: "es", pais });
  const [saving, setSaving] = useState(false);
  const create = async () => {
    setSaving(true);
    try {
      const fg = await api.createFocusGroup(f);
      onCreated(fg.id);
    } catch (e) { alert("Error: " + (e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo focus group</h2>
        <div><label>Nombre</label>
          <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label>Tema</label>
          <input value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} /></div>
        <div><label>Descripción</label>
          <textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></div>
        <div className="row">
          <div><label>Idioma</label>
            <input value={f.idioma} onChange={(e) => setF({ ...f, idioma: e.target.value })} /></div>
          <div><label>País (del escenario)</label>
            <input value={country.nombre} disabled title="Se cambia con el selector de país de la barra superior" /></div>
        </div>
        <p className="muted" style={{ fontSize: "0.78rem" }}>
          Solo podrás reclutar participantes de la población de {country.nombre}.
        </p>
        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={create} disabled={saving || !f.nombre}>Crear</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Detalle = CHAT ----------

interface ChatItem {
  questionId: number;
  pregunta: string;
  destinatarios: number[];
  responses: { id: number; persona_nombre: string; texto: string }[];
}

const wordsOf = (t: string): string[] => t.split(/\s+/).filter(Boolean);

function buildChat(questions: QuestionItem[]): ChatItem[] {
  return [...questions]
    .sort((a, b) => a.orden - b.orden)
    .map((q) => ({
      questionId: q.id,
      pregunta: q.texto,
      destinatarios: q.destinatarios ?? [],
      responses: [...q.responses]
        .sort((a, b) => a.orden - b.orden)
        .map((r) => ({ id: r.id, persona_nombre: r.persona_nombre, texto: r.texto })),
    }));
}

// ---------- Panel de recruiting con IA ----------

function RecruitPanel({
  id,
  currentMemberIds,
  onConfirmed,
  onCollapse,
}: {
  id: number;
  currentMemberIds: number[];
  onConfirmed: (fg: FocusGroup) => void;
  onCollapse: () => void;
}) {
  const [perfil, setPerfil] = useState("");
  const [cantidad, setCantidad] = useState(6);
  const [loading, setLoading] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidate[] | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const buscar = async () => {
    if (!perfil.trim()) return;
    setLoading(true);
    setCandidatos(null);
    try {
      setCandidatos(await api.recruit(id, perfil.trim(), cantidad));
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const cambiar = async (persona_id: number) => {
    if (!candidatos) return;
    setReplacingId(persona_id);
    try {
      const exclude = candidatos.map((c) => c.persona_id); // no repetir ninguno actual
      const alt = await api.recruitReplace(id, perfil.trim(), exclude);
      setCandidatos(candidatos.map((c) => (c.persona_id === persona_id ? alt : c)));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setReplacingId(null);
    }
  };

  const quitar = (persona_id: number) =>
    setCandidatos((cs) => (cs ? cs.filter((c) => c.persona_id !== persona_id) : cs));

  const confirmar = async () => {
    if (!candidatos || candidatos.length === 0) return;
    setConfirming(true);
    try {
      const g = await api.setMembers(id, candidatos.map((c) => c.persona_id));
      onConfirmed(g);
      setCandidatos(null);
      setPerfil("");
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="card">
      <div className="flex-between">
        <h3>Recruiting</h3>
        <button className="secondary" onClick={onCollapse}>‹ Ocultar panel</button>
      </div>
      <p className="muted">Describe el público objetivo y la IA elegirá candidatos de la biblioteca.</p>
      <div>
        <label>Perfil del público objetivo</label>
        <textarea
          rows={3}
          placeholder="Ej.: jóvenes urbanos sensibles a la sostenibilidad, con poder adquisitivo medio-alto"
          value={perfil}
          onChange={(e) => setPerfil(e.target.value)}
        />
      </div>
      <div className="row" style={{ marginTop: 6, alignItems: "flex-end" }}>
        <div style={{ maxWidth: 110 }}>
          <label>Nº participantes</label>
          <input type="number" min={1} max={30} value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, +e.target.value || 1))} />
        </div>
        <button onClick={buscar} disabled={loading || !perfil.trim()}>
          {loading ? "Buscando…" : "Buscar candidatos"}
        </button>
      </div>

      {candidatos && (
        <div style={{ marginTop: "0.9rem" }}>
          <div className="flex-between">
            <strong>Candidatos ({candidatos.length})</strong>
            {currentMemberIds.length > 0 && <span className="muted">Confirmados: {currentMemberIds.length}</span>}
          </div>
          {candidatos.length === 0 && <p className="muted">Ningún candidato. Prueba con otro perfil.</p>}
          {candidatos.map((c) => (
            <div className="candidate" key={c.persona_id}>
              <div className="flex-between">
                <strong>{c.nombre}</strong>
                <div style={{ whiteSpace: "nowrap" }}>
                  <button className="chip" onClick={() => cambiar(c.persona_id)} disabled={replacingId === c.persona_id}>
                    {replacingId === c.persona_id ? "…" : "Cambiar"}
                  </button>{" "}
                  <button className="chip" onClick={() => quitar(c.persona_id)}>Quitar</button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: "0.78rem" }}>
                {c.edad ?? "—"} años · vive en {c.pais_residencia ?? "—"}
                {c.pais_origen && c.pais_origen !== c.pais_residencia ? ` (origen: ${c.pais_origen})` : ""} · {c.ocupacion ?? "—"}
              </div>
              {c.motivo && <div style={{ fontSize: "0.8rem", marginTop: 3 }} className="muted">{c.motivo}</div>}
            </div>
          ))}
          <button style={{ marginTop: 8 }} onClick={confirmar}
            disabled={confirming || candidatos.length === 0}>
            {confirming ? "Confirmando…" : `Confirmar ${candidatos.length} participantes`}
          </button>
        </div>
      )}
    </div>
  );
}

function PersonaPopover({ p }: { p: Persona }) {
  const sd = p.sociodemografico ?? {};
  const op = p.opinion ?? {};
  return (
    <div className="chip-pop">
      <strong>{p.nombre}</strong>
      <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
        {sd.edad ?? "—"} años · {sd.ocupacion ?? "—"}
      </div>
      <div className="muted" style={{ fontSize: "0.72rem" }}>
        vive en {sd.pais_residencia ?? "—"}
        {sd.codigo_postal ? ` (CP ${sd.codigo_postal})` : ""}
        {sd.pais_origen && sd.pais_origen !== sd.pais_residencia ? ` · origen: ${sd.pais_origen}` : ""}
        {sd.nivel_educativo ? ` · ${sd.nivel_educativo}` : ""}
      </div>
      {p.bio && <p style={{ margin: "7px 0 0", fontSize: "0.78rem", lineHeight: 1.45 }}>{p.bio}</p>}
      {op.posicionamientos && (
        <p style={{ margin: "6px 0 0", fontSize: "0.74rem", lineHeight: 1.4 }} className="muted">
          {op.posicionamientos}
        </p>
      )}
      {(p.tags ?? []).length > 0 && (
        <div style={{ marginTop: 6 }}>
          {(p.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
    </div>
  );
}

function FocusGroupDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [fg, setFg] = useState<FocusGroup | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [estado, setEstado] = useState<string>("draft");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [genReport, setGenReport] = useState(false);

  const [texto, setTexto] = useState("");
  const [destinatarios, setDestinatarios] = useState<number[]>([]); // [] = todos
  const [revealed, setRevealed] = useState<Record<number, number>>({});
  const [cancelling, setCancelling] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const pollRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const chatRef = useRef<ChatItem[]>([]);
  chatRef.current = chat;

  const scrollToQuestion = (i: number) =>
    questionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const memberIds = fg ? fg.members.map((m) => m.persona_id) : [];
  const nombreDe = (pid: number) =>
    fg?.members.find((m) => m.persona_id === pid)?.nombre ?? "—";

  useEffect(() => {
    (async () => {
      const g = await api.getFocusGroup(id);
      setFg(g);
      setEstado(g.estado);
      const c = buildChat(g.questions);
      setChat(c);
      // El historial existente se muestra completo (sin efecto de tecleo)
      const full: Record<number, number> = {};
      c.forEach((it) => it.responses.forEach((r) => { full[r.id] = wordsOf(r.texto).length; }));
      setRevealed(full);
      setErrorMsg(g.error_msg ?? null);
      // Solo personas del país del focus group para el selector de miembros.
      api.listPersonas(undefined, g.pais).then(setPersonas);
    })();
    api.getReport(id).then(setReport).catch(() => setReport(null));
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, estado]);

  // Las respuestas nuevas (llegadas por polling) empiezan ocultas para teclearse
  useEffect(() => {
    setRevealed((prev) => {
      let changed = false;
      const next = { ...prev };
      chat.forEach((it) => it.responses.forEach((r) => {
        if (!(r.id in next)) { next[r.id] = 0; changed = true; }
      }));
      return changed ? next : prev;
    });
  }, [chat]);

  // Avanza la revelación palabra a palabra, SECUENCIALMENTE: solo teclea la
  // primera respuesta incompleta (en orden cronológico); las siguientes esperan
  // su turno. Así se ve como una conversación encadenada, no en simultáneo.
  useEffect(() => {
    const t = window.setInterval(() => {
      setRevealed((prev) => {
        for (const it of chatRef.current) {
          for (const r of it.responses) {
            const total = wordsOf(r.texto).length;
            const cur = prev[r.id] ?? 0;
            if (cur < total) {
              return { ...prev, [r.id]: Math.min(total, cur + 2) };
            }
          }
        }
        return prev; // todo revelado
      });
    }, 45);
    return () => window.clearInterval(t);
  }, []);

  // Restablece el estado de "interrumpiendo" cuando deja de generar
  useEffect(() => {
    if (estado !== "running") setCancelling(false);
  }, [estado]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      const st = await api.getStatus(id);
      setEstado(st.estado);
      setErrorMsg(st.error_msg ?? null);
      setChat(buildChat(st.questions));
      if (st.estado !== "running" && pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2000);
  };

  if (!fg) return (
    <div className="loading-center"><span className="spinner blink">Cargando…</span></div>
  );

  const memberIdSet = new Set(memberIds);
  const toggleMember = (pid: number) => {
    const has = memberIdSet.has(pid);
    const nextIds = has ? memberIds.filter((x) => x !== pid) : [...memberIds, pid];
    const nombre = personas.find((p) => p.id === pid)?.nombre ?? "—";
    // Actualización optimista (instantánea); el backend se sincroniza en segundo plano
    const nextMembers = has
      ? fg.members.filter((m) => m.persona_id !== pid)
      : [...fg.members, { persona_id: pid, nombre }];
    setFg({ ...fg, members: nextMembers });
    setDestinatarios((d) => d.filter((x) => nextIds.includes(x)));
    api.setMembers(id, nextIds).then(setFg).catch((e) => alert("Error: " + (e as Error).message));
  };

  const toggleDestinatario = (pid: number) =>
    setDestinatarios((d) => (d.includes(pid) ? d.filter((x) => x !== pid) : [...d, pid]));

  const enviar = async () => {
    const msg = texto.trim();
    if (!msg) return;
    // Añade el mensaje del moderador de forma optimista
    setChat((c) => [...c, { questionId: -1, pregunta: msg, destinatarios, responses: [] }]);
    setTexto("");
    setEstado("running");
    try {
      await api.ask(id, msg, destinatarios);
      startPolling();
    } catch (e) {
      alert("Error: " + (e as Error).message);
      setEstado("active");
    }
  };

  const interrumpir = async () => {
    setCancelling(true);
    try {
      await api.cancelAsk(id);
    } catch (e) {
      alert("Error: " + (e as Error).message);
      setCancelling(false);
    }
  };

  const generateReport = async () => {
    setGenReport(true);
    try { setReport(await api.createReport(id)); }
    catch (e) { alert("Error: " + (e as Error).message); }
    finally { setGenReport(false); }
  };

  const discardReport = async () => {
    if (!confirm("¿Descartar el informe? La conversación del chat se conserva.")) return;
    try {
      await api.deleteReport(id);
      setReport(null);
    } catch (e) { alert("Error: " + (e as Error).message); }
  };

  const destLabel =
    destinatarios.length === 0
      ? "Todos"
      : destinatarios.map(nombreDe).join(", ");

  return (
    <div className="w80">
      <div className="toolbar" style={{ position: "relative", alignItems: "center" }}>
        <button className="secondary" onClick={onBack}
          style={{ position: "absolute", left: "-7.5rem", top: "50%", transform: "translateY(-50%)" }}>
          ← Volver
        </button>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>{fg.nombre}</h2>
        <div style={{ flex: 1 }} />
        <button onClick={generateReport} disabled={estado === "running" || genReport || chat.length === 0}>
          {genReport ? "Generando…" : "Generar informe"}
        </button>
      </div>

      {errorMsg && <div className="card" style={{ color: "var(--danger)" }}>Error: {errorMsg}</div>}

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Columna izquierda: recruiting + participantes (colapsable) */}
        <div className={`left-col${leftCollapsed ? " collapsed" : ""}`}>
          <RecruitPanel
            id={id}
            currentMemberIds={memberIds}
            onConfirmed={(g) => { setFg(g); setDestinatarios([]); }}
            onCollapse={() => setLeftCollapsed(true)}
          />

          <details className="card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              Ajuste manual ({memberIds.length})
            </summary>
            <p className="muted">Marca o desmarca personas de la biblioteca.</p>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {personas.map((p) => (
                <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text)" }}>
                  <input type="checkbox" style={{ width: "auto" }}
                    checked={memberIdSet.has(p.id)} onChange={() => toggleMember(p.id)} />
                  {p.nombre} <span className="muted">({p.sociodemografico?.edad ?? "—"}, {p.sociodemografico?.pais_residencia ?? "—"})</span>
                </label>
              ))}
            </div>
          </details>
        </div>
        {leftCollapsed && (
          <button className="panel-expand" title="Mostrar panel de participantes"
            onClick={() => setLeftCollapsed(false)}>›</button>
        )}

        {/* Chat */}
        <div style={{ flex: "2 1 520px" }}>
          <div className="card chat-card">
            <div className="chat-thread">
              {chat.length === 0 && (
                <p className="muted">Escribe la primera pregunta del moderador para empezar el focus group.</p>
              )}
              {chat.map((item, i) => (
                <div key={i} ref={(el) => { questionRefs.current[i] = el; }} style={{ scrollMarginTop: 8 }}>
                  <div className="msg moderador">
                    <div className="msg-bubble">
                      {item.pregunta}
                      <div className="msg-dest">
                        → {item.destinatarios.length === 0 ? "Todos" : item.destinatarios.map(nombreDe).join(", ")}
                      </div>
                    </div>
                  </div>
                  {item.responses.map((r) => {
                    const words = wordsOf(r.texto);
                    const shown = revealed[r.id] ?? 0;
                    const text = shown >= words.length ? r.texto : words.slice(0, shown).join(" ");
                    return (
                      <div className="msg persona" key={r.id}>
                        <div className="msg-bubble">
                          <div className="msg-author">{r.persona_nombre}</div>
                          {text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {estado === "running" && <p className="spinner">Las personas están escribiendo…</p>}
              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div className="composer">
              <div className="dest-chips">
                <span className="muted" style={{ marginRight: 6 }}>Dirigir a:</span>
                <button
                  className={destinatarios.length === 0 ? "chip active" : "chip"}
                  onClick={() => setDestinatarios([])}
                  type="button"
                >Todos</button>
                {memberIds.map((pid) => {
                  const p = personas.find((x) => x.id === pid);
                  return (
                    <span className="chip-wrap" key={pid}>
                      <button
                        type="button"
                        className={destinatarios.includes(pid) ? "chip active" : "chip"}
                        onClick={() => toggleDestinatario(pid)}
                      >{nombreDe(pid)}</button>
                      {p && <PersonaPopover p={p} />}
                    </span>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  rows={2}
                  placeholder={memberIds.length === 0 ? "Añade participantes primero…" : `Pregunta del moderador (a: ${destLabel})`}
                  value={texto}
                  disabled={memberIds.length === 0 || estado === "running"}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                />
                {estado === "running" ? (
                  <button className="danger" onClick={interrumpir} disabled={cancelling}>
                    {cancelling ? "Interrumpiendo…" : "Interrumpir"}
                  </button>
                ) : (
                  <button onClick={enviar} disabled={memberIds.length === 0 || !texto.trim()}>
                    Enviar
                  </button>
                )}
              </div>
              <p className="muted" style={{ margin: "4px 0 0" }}>Enter para enviar · Shift + Enter para nueva línea</p>
            </div>
          </div>

          {report && (
            <div className="card">
              <div className="flex-between">
                <h3>Informe</h3>
                <div className="row" style={{ flex: "0 0 auto" }}>
                  <a href={api.exportUrl(id, "pdf")}><button className="secondary">PDF</button></a>{" "}
                  <a href={api.exportUrl(id, "docx")}><button className="secondary">Word</button></a>{" "}
                  <a href={api.exportUrl(id, "xlsx")}><button className="secondary">Excel</button></a>{" "}
                  <button className="danger" onClick={discardReport}>Cerrar</button>
                </div>
              </div>
              <div className="report"><Markdown>{report.contenido_markdown}</Markdown></div>
            </div>
          )}
        </div>

        {/* Navegador de preguntas del moderador */}
        <div style={{ flex: "1 1 200px", maxWidth: 280 }}>
          <div className="card qnav">
            <h3>Preguntas</h3>
            {chat.length === 0 && <p className="muted">Aún no hay preguntas.</p>}
            {chat.map((item, i) => (
              <button key={i} className="qnav-item" title={item.pregunta}
                onClick={() => scrollToQuestion(i)}>
                <span className="qnav-num">{i + 1}</span>
                <span className="qnav-text">{item.pregunta}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
