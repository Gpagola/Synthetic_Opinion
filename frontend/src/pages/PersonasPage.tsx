import { useEffect, useState } from "react";
import { api, Persona, PersonaBase, GenerateParams } from "../api/client";
import SpainChoropleth from "../components/SpainChoropleth";
import ChileChoropleth from "../components/ChileChoropleth";
import { useCountry } from "../CountryContext";
import { getCountry } from "../countries";

const emptyPersona = (pais = "ES"): PersonaBase => ({
  nombre: "",
  idioma: "es",
  pais,
  tags: [],
  sociodemografico: {},
  consumidor: { categorias_interes: [], marcas: [], canales: [] },
  opinion: { valores_vida: [], actitudes: [], rasgos_personalidad: [] },
  bio: "",
});

const AGE_BANDS: [string, number, number][] = [
  ["18-24", 18, 24], ["25-34", 25, 34], ["35-44", 35, 44], ["45-54", 45, 54],
  ["55-64", 55, 64], ["65-74", 65, 74], ["75-84", 75, 84], ["85+", 85, 200],
];

function normGenero(g?: string | null): "Mujer" | "Hombre" | "Otro" {
  const s = (g ?? "").toLowerCase();
  if (s.startsWith("muj") || s.startsWith("fem")) return "Mujer";
  if (s.startsWith("hom") || s.startsWith("masc") || s.startsWith("var")) return "Hombre";
  return "Otro";
}
function bandOf(edad?: number | null): string | null {
  if (edad == null) return null;
  for (const [l, lo, hi] of AGE_BANDS) if (edad >= lo && edad <= hi) return l;
  return null;
}

// Niveles de ingreso canónicos, ordenados de mayor a menor (Otros al final)
const INC_ORDER = ["Alto", "Medio-alto", "Medio", "Medio-bajo", "Bajo", "Otros"];
function normIngreso(s?: string | null): string {
  const t = (s ?? "").toLowerCase();
  if (/(medio|media).*(alto|alta)|(alto|alta).*(medio|media)/.test(t)) return "Medio-alto";
  if (/(medio|media).*(bajo|baja)|(bajo|baja).*(medio|media)/.test(t)) return "Medio-bajo";
  if (/medio|media/.test(t)) return "Medio";
  if (/bajo|baja/.test(t)) return "Bajo";
  if (/alto|alta/.test(t)) return "Alto";
  return "Otros";
}

// Niveles de educación canónicos, ordenados de menor a mayor (Otros al final)
const EDU_ORDER = [
  "Postgrado (máster/doctorado)",
  "Universitario (grado/diplomatura/FP superior)",
  "Formación Profesional (grado medio)",
  "Bachillerato",
  "Secundaria (1ª etapa / ESO)",
  "Primaria",
  "Sin estudios",
  "Otros",
];
// Etiqueta corta para el gráfico (el detalle completo va en el tooltip)
const EDU_SHORT: Record<string, string> = {
  "Postgrado (máster/doctorado)": "Postgrado",
  "Universitario (grado/diplomatura/FP superior)": "Universitario",
  "Formación Profesional (grado medio)": "Formación Profesional",
  "Secundaria (1ª etapa / ESO)": "Secundaria",
};
// Qué comprende cada nivel (tooltip al pasar el ratón)
const EDU_DESC: Record<string, string> = {
  "Postgrado": "Máster y doctorado",
  "Universitario": "Grado, diplomatura, licenciatura y FP de grado superior",
  "Formación Profesional": "FP de grado medio (ciclo formativo)",
  "Bachillerato": "Bachillerato (2ª etapa de secundaria)",
  "Secundaria": "Primera etapa de secundaria / ESO",
  "Primaria": "Educación primaria",
  "Sin estudios": "Sin estudios o sin titulación",
};

function normEdu(s?: string | null): string {
  const v = (s ?? "").trim();
  if (EDU_ORDER.includes(v)) return v; // ya es una categoría canónica
  const t = v.toLowerCase();
  if (/m[aá]ster|posgrado|postgrado|doctor|phd|mba/.test(t)) return "Postgrado (máster/doctorado)";
  if (/formaci[oó]n profesional|\bfp\b|grado medio|ciclo formativo|t[eé]cnic/.test(t)) return "Formación Profesional (grado medio)";
  if (/universi|licenci|diplom|ingenier|\bgrado\b|grado superior|educaci[oó]n superior/.test(t)) return "Universitario (grado/diplomatura/FP superior)";
  if (/bachiller|\bbup\b|\bcou\b/.test(t)) return "Bachillerato";
  if (/secundaria|\beso\b|graduado escolar/.test(t)) return "Secundaria (1ª etapa / ESO)";
  if (/primaria|primarios|\begb\b/.test(t)) return "Primaria";
  if (/sin estudios|ninguno|analfabet|sin formaci/.test(t)) return "Sin estudios";
  return "Otros";
}
function topEntries(obj: Record<string, number>, n = 7): [string, number][] {
  const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (arr.length <= n) return arr;
  const head = arr.slice(0, n);
  const rest = arr.slice(n).reduce((s, [, c]) => s + c, 0);
  head.push(["Otros", rest]);
  return head;
}

function StatBars({ items, detail, onSelect, selected }: {
  items: [string, number][];
  detail?: Record<string, string>;
  onSelect?: (label: string) => void;
  selected?: string;
}) {
  const max = Math.max(1, ...items.map(([, c]) => c));
  const total = items.reduce((s, [, c]) => s + c, 0) || 1;
  return (
    <div className="bars">
      {items.length === 0 && <p className="muted">Sin datos.</p>}
      {items.map(([label, count]) => (
        <div
          className={`bar-row${selected === label ? " active" : ""}`}
          key={label}
          onClick={onSelect ? () => onSelect(label) : undefined}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <span className="bar-label" title={detail?.[label] ?? label}>{label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(count / max) * 100}%` }} /></div>
          <span className="bar-count">{count} · {Math.round((count / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

interface PyrRow {
  band: string;
  Mujer_es: number; Mujer_ext: number; Hombre_es: number; Hombre_ext: number;
}

const GENDER_COLORS: Record<string, string> = {
  Mujer: "#06b6d4", Hombre: "#2f6bff", Otro: "#94a3b8",
};

function Donut({ items, onSelect, selected }: {
  items: [string, number][];
  onSelect?: (label: string) => void;
  selected?: string;
}) {
  const total = items.reduce((s, [, c]) => s + c, 0) || 1;
  const r = 62;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180" className="donut-svg">
        <g transform="rotate(-90 90 90)">
          <circle cx="90" cy="90" r={r} fill="none" stroke="var(--bg-2)" strokeWidth="24" />
          {items.map(([label, count]) => {
            const len = (count / total) * C;
            const seg = (
              <circle
                key={label} cx="90" cy="90" r={r} fill="none"
                stroke={GENDER_COLORS[label] ?? "#888"} strokeWidth="24"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
                strokeLinecap="butt"
              />
            );
            off += len;
            return seg;
          })}
        </g>
        <text x="90" y="86" textAnchor="middle" className="donut-total">{total}</text>
        <text x="90" y="106" textAnchor="middle" className="donut-sub">personas</text>
      </svg>
      <div className="donut-legend">
        {items.map(([label, count]) => (
          <div
            className={`donut-leg-row${selected === label ? " active" : ""}`}
            key={label}
            onClick={onSelect ? () => onSelect(label) : undefined}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            <i style={{ background: GENDER_COLORS[label] ?? "#888" }} />
            <span>{label}</span>
            <span className="muted">{count} · {Math.round((count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pyramid({ data, onSelect, selected }: {
  data: PyrRow[];
  onSelect?: (band: string) => void;
  selected?: string;
}) {
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.Hombre_es + d.Hombre_ext, d.Mujer_es + d.Mujer_ext))
  );
  const rows = [...data].reverse(); // mayor edad arriba, menor abajo
  return (
    <div className="pyramid">
      <div className="pyr-legend">
        <span><i className="sw h" /> Hombres</span>
        <span><i className="sw m" /> Mujeres</span>
        <span className="muted">tono claro · nacidos fuera</span>
      </div>
      {rows.map((d) => {
        const hTot = d.Hombre_es + d.Hombre_ext;
        const mTot = d.Mujer_es + d.Mujer_ext;
        return (
          <div
            className={`pyr-row${selected === d.band ? " active" : ""}`}
            key={d.band}
            onClick={onSelect ? () => onSelect(d.band) : undefined}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            <div className="pyr-side left">
              <span className="pyr-n">{hTot || ""}</span>
              <div className="pyr-bar-group" style={{ width: `${(hTot / max) * 100}%` }}>
                <div className="seg h-ext" style={{ flexGrow: d.Hombre_ext }} />
                <div className="seg h-es" style={{ flexGrow: d.Hombre_es }} />
              </div>
            </div>
            <div className="pyr-label">{d.band}</div>
            <div className="pyr-side right">
              <div className="pyr-bar-group" style={{ width: `${(mTot / max) * 100}%` }}>
                <div className="seg m-es" style={{ flexGrow: d.Mujer_es }} />
                <div className="seg m-ext" style={{ flexGrow: d.Mujer_ext }} />
              </div>
              <span className="pyr-n">{mTot || ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_FILTERS = {
  nombre: "", origen: "", residencia: "", ocupacion: "", tags: "", fuente: "", edadMin: "", edadMax: "",
  region: "", provincia: "", genero: "", ingresos: "", educacion: "",
};

// Caché a nivel de módulo, por país: persiste la población cargada entre
// navegaciones (la página se desmonta al cambiar de pestaña, pero esto sobrevive).
const personasCache: Record<string, Persona[]> = {};

export default function PersonasPage() {
  const { pais, country } = useCountry();
  const [personas, setPersonas] = useState<Persona[]>(personasCache[pais] ?? []);
  const [loaded, setLoaded] = useState(personasCache[pais] !== undefined);
  const [progress, setProgress] = useState(personasCache[pais] !== undefined ? 100 : 6);
  const [showLoader, setShowLoader] = useState(personasCache[pais] === undefined);
  const [editing, setEditing] = useState<(PersonaBase & { id?: number }) | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY_FILTERS });
  const [listCollapsed, setListCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = () =>
    api.listPersonas(undefined, pais)
      .then((d) => { personasCache[pais] = d; setPersonas(d); setLoaded(true); })
      .catch((e) => { console.error(e); setLoaded(true); });
  // Al montar y al CAMBIAR DE PAÍS: usa la caché del país o recarga.
  useEffect(() => {
    setF({ ...EMPTY_FILTERS });  // los filtros (región, etc.) son específicos de país
    if (personasCache[pais] !== undefined) {
      setPersonas(personasCache[pais]); setLoaded(true); setShowLoader(false); setProgress(100);
    } else {
      setPersonas([]); setLoaded(false); setShowLoader(true); setProgress(6); load();
    }
  }, [pais]);
  useEffect(() => { setPage(1); }, [f]);

  // Barra de progreso del popup: avanza mientras carga y se completa al llegar los datos.
  useEffect(() => {
    if (loaded) {
      setProgress(100);
      const t = setTimeout(() => setShowLoader(false), 500);
      return () => clearTimeout(t);
    }
    const id = setInterval(() => {
      setProgress((p) => (p < 92 ? p + Math.max(0.5, (92 - p) * 0.1) : p));
    }, 180);
    return () => clearInterval(id);
  }, [loaded]);

  const onDelete = async (id: number) => {
    if (!confirm("¿Archivar esta persona? Sus respuestas previas se conservan.")) return;
    await api.deletePersona(id);
    load();
  };

  const inc = (val: string | null | undefined, q: string) =>
    !q.trim() || (val ?? "").toLowerCase().includes(q.trim().toLowerCase());

  const filtered = personas.filter((p) => {
    const sd = p.sociodemografico ?? {};
    if (!inc(p.nombre, f.nombre)) return false;
    if (!inc(sd.pais_origen, f.origen)) return false;
    if (!inc(sd.pais_residencia, f.residencia)) return false;
    if (!inc(sd.ocupacion, f.ocupacion)) return false;
    if (f.fuente && p.origen !== f.fuente) return false;
    if (f.tags.trim() && !(p.tags ?? []).some((t) => t.toLowerCase().includes(f.tags.trim().toLowerCase()))) return false;
    const edad = sd.edad;
    if (f.edadMin && (edad == null || edad < +f.edadMin)) return false;
    if (f.edadMax && (edad == null || edad > +f.edadMax)) return false;
    if (f.region && sd.region !== f.region) return false;
    if (f.provincia && (sd.codigo_postal ?? "").slice(0, 2) !== f.provincia) return false;
    if (f.genero && normGenero(sd.genero) !== f.genero) return false;
    if (f.ingresos && normIngreso(sd.ingresos) !== f.ingresos) return false;
    if (f.educacion) {
      const full = normEdu(sd.nivel_educativo);
      if ((EDU_SHORT[full] ?? full) !== f.educacion) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageItems = filtered.slice((current - 1) * pageSize, current * pageSize);
  const upd = (patch: Partial<typeof EMPTY_FILTERS>) => setF({ ...f, ...patch });

  // Estadísticas del conjunto FILTRADO (sensibles a los filtros)
  const stats = (() => {
    const pyr = AGE_BANDS.map(([band]) => ({
      band, Mujer_es: 0, Mujer_ext: 0, Hombre_es: 0, Hombre_ext: 0,
    }));
    const idx: Record<string, number> = {};
    AGE_BANDS.forEach(([b], i) => (idx[b] = i));
    const gen: Record<string, number> = {};
    const inc: Record<string, number> = {};
    const edu: Record<string, number> = {};
    const reg: Record<string, number> = {};
    const prov: Record<string, number> = {};
    for (const p of filtered) {
      const sd = p.sociodemografico ?? {};
      const g = normGenero(sd.genero);
      gen[g] = (gen[g] || 0) + 1;
      const rg = (sd.region ?? "").trim();
      if (rg) reg[rg] = (reg[rg] || 0) + 1;
      const cp = (sd.codigo_postal ?? "").trim();
      if (cp.length >= 2) { const code = cp.slice(0, 2); prov[code] = (prov[code] || 0) + 1; }
      const b = bandOf(sd.edad);
      if (b && (g === "Mujer" || g === "Hombre")) {
        const foreign = !!sd.pais_origen
          && sd.pais_origen.trim().toLowerCase() !== country.nombre.toLowerCase();
        pyr[idx[b]][`${g}_${foreign ? "ext" : "es"}` as "Mujer_es" | "Mujer_ext" | "Hombre_es" | "Hombre_ext"]++;
      }
      const i = normIngreso(sd.ingresos);
      inc[i] = (inc[i] || 0) + 1;
      const e = normEdu(sd.nivel_educativo);
      edu[e] = (edu[e] || 0) + 1;
    }
    const genItems = (["Mujer", "Hombre", "Otro"] as const)
      .filter((k) => gen[k])
      .map((k) => [k, gen[k]] as [string, number]);
    const incItems = INC_ORDER.filter((k) => inc[k]).map((k) => [k, inc[k]] as [string, number]);
    const eduFull = EDU_ORDER.filter((k) => edu[k]);
    const eduItems = eduFull.map((k) => [EDU_SHORT[k] ?? k, edu[k]] as [string, number]);
    const eduDetail = Object.fromEntries(eduFull.map((k) => [EDU_SHORT[k] ?? k, k]));
    return { pyr, genItems, incItems, eduItems, eduDetail, byRegion: reg, byProvince: prov };
  })();

  return (
    <div className="w80">
      {showLoader && (
        <div className="loading-overlay">
          <div className="loading-pop">
            <span className="loading-label blink-slow">Cargando población…</span>
            <div className="loading-bar">
              <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="loading-pct">{Math.round(progress)}%</span>
          </div>
        </div>
      )}
      <div className="toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>Población sintética</h2>
            {loaded && (
              <span className="muted" style={{ fontSize: "1rem", whiteSpace: "nowrap" }}>
                {filtered.length} de {personas.length}
              </span>
            )}
          </div>
          <p className="muted" style={{ margin: 0, maxWidth: 620, fontSize: "0.85rem" }}>
            Perfiles modelados para reflejar la distribución real de la población {country.gentilicio}
            {" "}adulta (mayor de 18 años) —edad, sexo, región y estudios—. Estructura basada en {country.fuenteDemografica}.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setGenOpen(true)}>Generar con IA</button>
        <button className="secondary" onClick={() => setEditing(emptyPersona(pais))}>
          + Nueva manual
        </button>
      </div>

      <div className="card filters">
        <div style={{ flex: "2 1 200px" }}><label>Nombre</label>
          <input value={f.nombre} onChange={(e) => upd({ nombre: e.target.value })} /></div>
        <div style={{ flex: "0 0 150px" }}><label>Edad (min–máx)</label>
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" placeholder="mín" value={f.edadMin} onChange={(e) => upd({ edadMin: e.target.value })} />
            <input type="number" placeholder="máx" value={f.edadMax} onChange={(e) => upd({ edadMax: e.target.value })} />
          </div></div>
        <div><label>Origen</label>
          <input value={f.origen} onChange={(e) => upd({ origen: e.target.value })} /></div>
        <div><label>Residencia</label>
          <input value={f.residencia} onChange={(e) => upd({ residencia: e.target.value })} /></div>
        <div><label>Ocupación</label>
          <input value={f.ocupacion} onChange={(e) => upd({ ocupacion: e.target.value })} /></div>
        <div><label>Tags</label>
          <input value={f.tags} onChange={(e) => upd({ tags: e.target.value })} /></div>
        <div style={{ flex: "0 0 120px" }}><label>Fuente</label>
          <select value={f.fuente} onChange={(e) => upd({ fuente: e.target.value })}>
            <option value="">Todas</option>
            <option value="ai">IA</option>
            <option value="manual">Manual</option>
          </select></div>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end" }}>
          <button className="secondary" onClick={() => setF({ ...EMPTY_FILTERS })}>Limpiar</button>
        </div>
      </div>

      {(() => {
        // Fichas reutilizadas en ambos layouts
        const cardPiramide = (
          <div className="card"><h3>Pirámide demográfica</h3>
            <Pyramid
              data={stats.pyr}
              selected={AGE_BANDS.find(([, lo, hi]) => String(lo) === f.edadMin && String(hi) === f.edadMax)?.[0] ?? ""}
              onSelect={(band) => {
                const b = AGE_BANDS.find((x) => x[0] === band);
                if (!b) return;
                setF((p) => (String(b[1]) === p.edadMin && String(b[2]) === p.edadMax)
                  ? { ...p, edadMin: "", edadMax: "" }
                  : { ...p, edadMin: String(b[1]), edadMax: String(b[2]) });
              }}
            />
          </div>
        );
        const cardIngresos = (
          <div className="card"><h3>Nivel de ingresos</h3>
            <StatBars items={stats.incItems} selected={f.ingresos}
              onSelect={(l) => setF((p) => ({ ...p, ingresos: p.ingresos === l ? "" : l }))} />
          </div>
        );
        const cardGenero = (
          <div className="card"><h3>Género</h3>
            <Donut items={stats.genItems} selected={f.genero}
              onSelect={(l) => setF((p) => ({ ...p, genero: p.genero === l ? "" : l }))} />
          </div>
        );
        const cardEducacion = (
          <div className="card"><h3>Nivel de educación</h3>
            <StatBars items={stats.eduItems} detail={EDU_DESC} selected={f.educacion}
              onSelect={(l) => setF((p) => ({ ...p, educacion: p.educacion === l ? "" : l }))} />
          </div>
        );

        // CHILE: mapa apaisado a todo el ancho arriba + las 4 fichas debajo.
        if (country.mapa === "cl-choropleth") {
          return (
            <>
              <div className="card stats-map"><h3>Distribución territorial</h3>
                <ChileChoropleth
                  byRegion={stats.byRegion}
                  selectedRegion={f.region}
                  onSelect={(key) =>
                    setF((prev) => ({ ...prev, region: prev.region === key ? "" : key, provincia: "" }))}
                />
              </div>
              <div className="stats-grid4">
                {cardPiramide}{cardIngresos}{cardGenero}{cardEducacion}
              </div>
            </>
          );
        }

        // ESPAÑA (y por defecto): layout original de 3 columnas, mapa en el centro.
        return (
          <div className="stats-layout">
            <div className="stats-side">{cardPiramide}{cardIngresos}</div>
            <div className="stats-center">
              <div className="card"><h3>Distribución territorial</h3>
                <SpainChoropleth
                  byRegion={stats.byRegion}
                  byProvince={stats.byProvince}
                  selectedRegion={f.region}
                  selectedProvince={f.provincia}
                  onSelect={(kind, key) =>
                    setF((prev) => kind === "prov"
                      ? { ...prev, provincia: prev.provincia === key ? "" : key, region: "" }
                      : { ...prev, region: prev.region === key ? "" : key, provincia: "" })}
                />
              </div>
            </div>
            <div className="stats-side">{cardGenero}{cardEducacion}</div>
          </div>
        );
      })()}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem", marginTop: "1rem" }}>
        <button className="secondary" onClick={() => setListCollapsed((v) => !v)}>
          {listCollapsed ? "Mostrar lista" : "Ocultar lista · ver solo fichas"}
        </button>
      </div>

      {!listCollapsed && (
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Origen</th>
              <th>Residencia</th>
              <th>Ocupación</th>
              <th>Fuente</th>
              <th>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.nombre}</strong></td>
                <td>{p.sociodemografico?.edad ?? "—"}</td>
                <td>{p.sociodemografico?.pais_origen ?? "—"}</td>
                <td>{p.sociodemografico?.pais_residencia ?? "—"}</td>
                <td>{p.sociodemografico?.ocupacion ?? "—"}</td>
                <td><span className="tag">{p.origen}</span></td>
                <td>{(p.tags ?? []).map((t) => <span key={t} className="tag">{t}</span>)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="secondary" onClick={() => setEditing(p)}>Editar</button>{" "}
                  <button className="danger" onClick={() => onDelete(p.id)}>Archivar</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="muted">Sin resultados con estos filtros.</td></tr>
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="pagination">
            <button className="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>← Anterior</button>
            <span className="muted">Página {current} de {totalPages}</span>
            <button className="secondary" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Siguiente →</button>
          </div>
        )}
      </div>
      )}

      {editing && (
        <PersonaEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {genOpen && (
        <GenerateModal
          onClose={() => setGenOpen(false)}
          onSaved={() => { setGenOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ---------- Editor de persona ----------

function listField(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}
function parseList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function PersonaEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: PersonaBase & { id?: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p, setP] = useState<PersonaBase & { id?: number }>(JSON.parse(JSON.stringify(initial)));
  const [saving, setSaving] = useState(false);

  const sd = p.sociodemografico;
  const cons = p.consumidor;
  const op = p.opinion;

  const save = async () => {
    setSaving(true);
    try {
      if (p.id) await api.updatePersona(p.id, p);
      else await api.createPersona({ ...p, origen: "manual" });
      onSaved();
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{p.id ? "Editar persona" : "Nueva persona"}</h2>

        <div className="row">
          <div><label>Nombre</label>
            <input value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} /></div>
          <div><label>Idioma</label>
            <input value={p.idioma} onChange={(e) => setP({ ...p, idioma: e.target.value })} /></div>
        </div>

        <h3>Sociodemográfico</h3>
        <div className="row">
          <div><label>Edad</label>
            <input type="number" value={sd.edad ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, edad: e.target.value ? +e.target.value : null } })} /></div>
          <div><label>Género</label>
            <input value={sd.genero ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, genero: e.target.value } })} /></div>
          <div><label>País de origen</label>
            <input value={sd.pais_origen ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, pais_origen: e.target.value } })} /></div>
          <div><label>País de residencia</label>
            <input value={sd.pais_residencia ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, pais_residencia: e.target.value } })} /></div>
          <div><label>Código postal</label>
            <input value={sd.codigo_postal ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, codigo_postal: e.target.value } })} /></div>
        </div>
        <div className="row">
          <div><label>Ocupación</label>
            <input value={sd.ocupacion ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, ocupacion: e.target.value } })} /></div>
          <div><label>Nivel educativo</label>
            <input value={sd.nivel_educativo ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, nivel_educativo: e.target.value } })} /></div>
          <div><label>Ingresos</label>
            <input value={sd.ingresos ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, ingresos: e.target.value } })} /></div>
        </div>

        <h3>Consumidor</h3>
        <div><label>Categorías de interés (coma)</label>
          <input value={listField(cons.categorias_interes)} onChange={(e) =>
            setP({ ...p, consumidor: { ...cons, categorias_interes: parseList(e.target.value) } })} /></div>
        <div><label>Marcas (coma)</label>
          <input value={listField(cons.marcas)} onChange={(e) =>
            setP({ ...p, consumidor: { ...cons, marcas: parseList(e.target.value) } })} /></div>
        <div className="row">
          <div><label>Hábitos de gasto</label>
            <input value={cons.habitos_gasto ?? ""} onChange={(e) =>
              setP({ ...p, consumidor: { ...cons, habitos_gasto: e.target.value } })} /></div>
          <div><label>Sensibilidad al precio</label>
            <input value={cons.sensibilidad_precio ?? ""} onChange={(e) =>
              setP({ ...p, consumidor: { ...cons, sensibilidad_precio: e.target.value } })} /></div>
        </div>

        <h3>Opinión / valores</h3>
        <div><label>Valores ante la vida (coma)</label>
          <input value={listField(op.valores_vida)} onChange={(e) =>
            setP({ ...p, opinion: { ...op, valores_vida: parseList(e.target.value) } })} /></div>
        <div><label>Rasgos de personalidad (coma)</label>
          <input value={listField(op.rasgos_personalidad)} onChange={(e) =>
            setP({ ...p, opinion: { ...op, rasgos_personalidad: parseList(e.target.value) } })} /></div>

        <h3>Tags y biografía</h3>
        <div><label>Tags (coma)</label>
          <input value={listField(p.tags)} onChange={(e) =>
            setP({ ...p, tags: parseList(e.target.value) })} /></div>
        <div><label>Bio (narrativa del personaje)</label>
          <textarea rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></div>

        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={save} disabled={saving || !p.nombre}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Modal de generación con IA ----------

function GenerateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { pais, country } = useCountry();
  const [params, setParams] = useState<GenerateParams>({ cantidad: 3, idioma: "es", pais });
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<PersonaBase[] | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const generate = async () => {
    setLoading(true);
    setDrafts(null);
    try {
      setDrafts(await api.generatePersonas(params));
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async (idx: number) => {
    if (!drafts) return;
    setSavingIdx(idx);
    try {
      await api.createPersona({ ...drafts[idx], origen: "ai" });
      setSaved((prev) => new Set(prev).add(idx));
    } catch (e) {
      alert("Error: " + (e as Error).message);
    } finally {
      setSavingIdx(null);
    }
  };

  const saveAll = async () => {
    if (!drafts) return;
    for (let i = 0; i < drafts.length; i++) if (!saved.has(i)) await saveDraft(i);
    onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Generar personas con IA</h2>
        <div className="row">
          <div><label>Cantidad</label>
            <input type="number" min={1} max={20} value={params.cantidad}
              onChange={(e) => setParams({ ...params, cantidad: +e.target.value })} /></div>
          <div><label>Idioma</label>
            <input value={params.idioma} onChange={(e) => setParams({ ...params, idioma: e.target.value })} /></div>
          <div><label>País (del escenario)</label>
            <input value={country.nombre} disabled title="Se cambia con el selector de país de la barra superior" /></div>
          <div><label>Región (opcional)</label>
            <select value={params.region ?? ""} onChange={(e) => setParams({ ...params, region: e.target.value || undefined })}>
              <option value="">Cualquiera</option>
              {country.regiones.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
        </div>
        <div className="row">
          <div><label>Edad mín.</label>
            <input type="number" value={params.edad_min ?? ""}
              onChange={(e) => setParams({ ...params, edad_min: e.target.value ? +e.target.value : undefined })} /></div>
          <div><label>Edad máx.</label>
            <input type="number" value={params.edad_max ?? ""}
              onChange={(e) => setParams({ ...params, edad_max: e.target.value ? +e.target.value : undefined })} /></div>
          <div><label>Segmento</label>
            <input value={params.segmento ?? ""} onChange={(e) => setParams({ ...params, segmento: e.target.value })} /></div>
        </div>
        <div><label>Instrucciones adicionales</label>
          <textarea rows={2} value={params.instrucciones ?? ""}
            onChange={(e) => setParams({ ...params, instrucciones: e.target.value })} /></div>

        <div style={{ marginTop: "0.75rem" }}>
          <button onClick={generate} disabled={loading}>
            {loading ? "Generando…" : "Generar borradores"}
          </button>
        </div>

        {drafts && (
          <div style={{ marginTop: "1rem" }}>
            <div className="flex-between">
              <h3>Borradores ({drafts.length})</h3>
              <button className="secondary" onClick={saveAll}>Guardar todos</button>
            </div>
            {drafts.map((d, i) => (
              <div className="card" key={i}>
                <div className="flex-between">
                  <strong>{d.nombre}</strong>
                  <button onClick={() => saveDraft(i)} disabled={saved.has(i) || savingIdx === i}>
                    {saved.has(i) ? "Guardada" : savingIdx === i ? "…" : "Guardar"}
                  </button>
                </div>
                <p className="muted">
                  {d.sociodemografico?.edad} años · {d.sociodemografico?.ocupacion} · vive en {d.sociodemografico?.pais_residencia ?? "—"}
                  {d.sociodemografico?.pais_origen && d.sociodemografico?.pais_origen !== d.sociodemografico?.pais_residencia
                    ? ` (origen: ${d.sociodemografico?.pais_origen})` : ""}
                </p>
                <p style={{ fontSize: "0.85rem" }}>{d.bio}</p>
              </div>
            ))}
            <p className="muted">Para afinar un borrador, guárdalo y edítalo desde la lista.</p>
          </div>
        )}

        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
