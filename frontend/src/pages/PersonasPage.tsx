import { useEffect, useState } from "react";
import { api, Persona, PersonaBase, GenerateParams } from "../api/client";
import SpainChoropleth from "../components/SpainChoropleth";
import ChileChoropleth from "../components/ChileChoropleth";
import { useCountry } from "../CountryContext";
import { getCountry } from "../countries";
import { useLocale } from "../locales/index";

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
  "Formación Profesional (grado medio)": "FP",
  "Secundaria (1ª etapa / ESO)": "Secundaria",
};
// Qué comprende cada nivel (tooltip al pasar el ratón)
const EDU_DESC: Record<string, string> = {
  "Postgrado": "Máster y doctorado",
  "Universitario": "Grado, diplomatura, licenciatura y FP de grado superior",
  "FP": "FP de grado medio (ciclo formativo)",
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
// Clasificación de una persona en ingresos/educación. Prefiere los campos
// canónicos del seed calibrado (`nivel_ingresos`, `nivel_educativo_cat`) y, si no
// existen (p.ej. personas de España), cae al normalizador por texto libre.
function incOf(sd: any): string {
  const c = sd?.nivel_ingresos;
  return INC_ORDER.includes(c) ? c : normIngreso(sd?.ingresos);
}
function eduOf(sd: any): string {
  const c = sd?.nivel_educativo_cat;
  return EDU_ORDER.includes(c) ? c : normEdu(sd?.nivel_educativo);
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
  const { t } = useLocale();
  const max = Math.max(1, ...items.map(([, c]) => c));
  const total = items.reduce((s, [, c]) => s + c, 0) || 1;
  return (
    <div className="bars">
      {items.length === 0 && <p className="muted">{t("common.sin_datos")}</p>}
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
  const { t } = useLocale();
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
        <text x="90" y="106" textAnchor="middle" className="donut-sub">{t("personas.donut_sub")}</text>
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
  const { t } = useLocale();
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.Hombre_es + d.Hombre_ext, d.Mujer_es + d.Mujer_ext))
  );
  const rows = [...data].reverse(); // mayor edad arriba, menor abajo
  return (
    <div className="pyramid">
      <div className="pyr-legend">
        <span><i className="sw h" /> {t("personas.pyr_hombres")}</span>
        <span><i className="sw m" /> {t("personas.pyr_mujeres")}</span>
        <span className="muted">{t("personas.pyr_nacidos_fuera")}</span>
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
  const { t, locale } = useLocale();
  const [personas, setPersonas] = useState<Persona[]>(personasCache[pais] ?? []);
  const [loaded, setLoaded] = useState(personasCache[pais] !== undefined);
  const [progress, setProgress] = useState(personasCache[pais] !== undefined ? 100 : 6);
  const [showLoader, setShowLoader] = useState(personasCache[pais] === undefined);
  const [editing, setEditing] = useState<(PersonaBase & { id?: number }) | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY_FILTERS });
  const [listCollapsed, setListCollapsed] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 40;

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
    if (!confirm(t("personas.confirmar_archivar"))) return;
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
    if (f.ingresos && incOf(sd) !== f.ingresos) return false;
    if (f.educacion) {
      const full = eduOf(sd);
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
      const i = incOf(sd);
      inc[i] = (inc[i] || 0) + 1;
      const e = eduOf(sd);
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
            <span className="loading-label blink-slow">{t("personas.cargando")}</span>
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
            <h2 style={{ margin: 0, fontWeight: 400, fontSize: "2.6rem" }}>{t("personas.title")}</h2>
            {loaded && (
              <span className="muted" style={{ fontSize: "1rem", whiteSpace: "nowrap" }}>
                {t("personas.n_de_total", { n: filtered.length, total: personas.length })}
              </span>
            )}
          </div>
          <p className="muted" style={{ margin: 0, maxWidth: 620, fontSize: "0.85rem" }}>
            {t("personas.subtitle", {
              adj: locale === "en" ? country.adjetivoEN : country.gentilicio,
              fuente: country.fuenteDemografica,
            })}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setGenOpen(true)}>{t("personas.generar_ia")}</button>
        <button className="secondary" onClick={() => setEditing(emptyPersona(pais))}>
          {t("personas.nueva_manual")}
        </button>
      </div>

      <div className="card filters">
        <div style={{ flex: "2 1 200px" }}><label>{t("personas.filtro_nombre")}</label>
          <input value={f.nombre} onChange={(e) => upd({ nombre: e.target.value })} /></div>
        <div style={{ flex: "0 0 150px" }}><label>{t("personas.filtro_edad")}</label>
          <div style={{ display: "flex", gap: 4 }}>
            <input type="number" placeholder={t("personas.filtro_edad_min")} value={f.edadMin} onChange={(e) => upd({ edadMin: e.target.value })} />
            <input type="number" placeholder={t("personas.filtro_edad_max")} value={f.edadMax} onChange={(e) => upd({ edadMax: e.target.value })} />
          </div></div>
        <div><label>{t("personas.filtro_origen")}</label>
          <input value={f.origen} onChange={(e) => upd({ origen: e.target.value })} /></div>
        <div><label>{t("personas.filtro_residencia")}</label>
          <input value={f.residencia} onChange={(e) => upd({ residencia: e.target.value })} /></div>
        <div><label>{t("personas.filtro_ocupacion")}</label>
          <input value={f.ocupacion} onChange={(e) => upd({ ocupacion: e.target.value })} /></div>
        <div><label>{t("personas.filtro_tags")}</label>
          <input value={f.tags} onChange={(e) => upd({ tags: e.target.value })} /></div>
        <div style={{ flex: "0 0 120px" }}><label>{t("personas.filtro_fuente")}</label>
          <select value={f.fuente} onChange={(e) => upd({ fuente: e.target.value })}>
            <option value="">{t("personas.filtro_fuente_todas")}</option>
            <option value="ai">{t("personas.filtro_fuente_ia")}</option>
            <option value="manual">{t("personas.filtro_fuente_manual")}</option>
          </select></div>
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end" }}>
          <button className="secondary" onClick={() => setF({ ...EMPTY_FILTERS })}>{t("personas.filtro_limpiar")}</button>
        </div>
      </div>

      {(() => {
        // Fichas reutilizadas en ambos layouts
        const cardPiramide = (
          <div className="card"><h3>{t("personas.stats_piramide")}</h3>
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
          <div className="card"><h3>{t("personas.stats_ingresos")}</h3>
            <StatBars items={stats.incItems} selected={f.ingresos}
              onSelect={(l) => setF((p) => ({ ...p, ingresos: p.ingresos === l ? "" : l }))} />
          </div>
        );
        const cardGenero = (
          <div className="card"><h3>{t("personas.stats_genero")}</h3>
            <Donut items={stats.genItems} selected={f.genero}
              onSelect={(l) => setF((p) => ({ ...p, genero: p.genero === l ? "" : l }))} />
          </div>
        );
        const cardEducacion = (
          <div className="card"><h3>{t("personas.stats_educacion")}</h3>
            <StatBars items={stats.eduItems} detail={EDU_DESC} selected={f.educacion}
              onSelect={(l) => setF((p) => ({ ...p, educacion: p.educacion === l ? "" : l }))} />
          </div>
        );

        // CHILE: mapa apaisado a todo el ancho arriba + las 4 fichas debajo.
        if (country.mapa === "cl-choropleth") {
          return (
            <>
              <div className="card stats-map"><h3>{t("personas.stats_mapa")}</h3>
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
              <div className="card"><h3>{t("personas.stats_mapa")}</h3>
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
          {listCollapsed ? t("personas.mostrar_lista") : t("personas.ocultar_lista")}
        </button>
      </div>

      {!listCollapsed && (
      <div className="card table-card">
        {totalPages > 1 && (
          <div className="pagination pagination-top">
            <button className="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t("personas.tabla_anterior")}</button>
            <span className="muted">{t("personas.tabla_pagina", { current, total: totalPages })}</span>
            <button className="secondary" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>{t("personas.tabla_siguiente")}</button>
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>{t("personas.tabla_nombre")}</th>
              <th>{t("personas.tabla_edad")}</th>
              <th>{t("personas.tabla_origen")}</th>
              <th>{t("personas.tabla_residencia")}</th>
              <th>{t("personas.tabla_ocupacion")}</th>
              <th>{t("personas.tabla_fuente")}</th>
              <th>{t("personas.tabla_tags")}</th>
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
                <td>{(p.tags ?? []).map((tag) => <span key={tag} className="tag">{tag}</span>)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="secondary" onClick={() => setEditing(p)}>{t("personas.btn_editar")}</button>{" "}
                  <button className="danger" onClick={() => onDelete(p.id)}>{t("personas.btn_archivar")}</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="muted">{t("personas.tabla_sin_resultados")}</td></tr>
            )}
          </tbody>
        </table>
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
  const { t } = useLocale();
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
        <h2>{p.id ? t("editor.titulo_editar") : t("editor.titulo_nueva")}</h2>

        <div className="row">
          <div><label>{t("editor.nombre")}</label>
            <input value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} /></div>
          <div><label>{t("editor.idioma")}</label>
            <input value={p.idioma} onChange={(e) => setP({ ...p, idioma: e.target.value })} /></div>
        </div>

        <h3>{t("editor.seccion_socio")}</h3>
        <div className="row">
          <div><label>{t("editor.edad")}</label>
            <input type="number" value={sd.edad ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, edad: e.target.value ? +e.target.value : null } })} /></div>
          <div><label>{t("editor.genero")}</label>
            <input value={sd.genero ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, genero: e.target.value } })} /></div>
          <div><label>{t("editor.pais_origen")}</label>
            <input value={sd.pais_origen ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, pais_origen: e.target.value } })} /></div>
          <div><label>{t("editor.pais_residencia")}</label>
            <input value={sd.pais_residencia ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, pais_residencia: e.target.value } })} /></div>
          <div><label>{t("editor.codigo_postal")}</label>
            <input value={sd.codigo_postal ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, codigo_postal: e.target.value } })} /></div>
        </div>
        <div className="row">
          <div><label>{t("editor.ocupacion")}</label>
            <input value={sd.ocupacion ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, ocupacion: e.target.value } })} /></div>
          <div><label>{t("editor.nivel_educativo")}</label>
            <input value={sd.nivel_educativo ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, nivel_educativo: e.target.value } })} /></div>
          <div><label>{t("editor.ingresos")}</label>
            <input value={sd.ingresos ?? ""} onChange={(e) =>
              setP({ ...p, sociodemografico: { ...sd, ingresos: e.target.value } })} /></div>
        </div>

        <h3>{t("editor.seccion_consumidor")}</h3>
        <div><label>{t("editor.categorias_interes")}</label>
          <input value={listField(cons.categorias_interes)} onChange={(e) =>
            setP({ ...p, consumidor: { ...cons, categorias_interes: parseList(e.target.value) } })} /></div>
        <div><label>{t("editor.marcas")}</label>
          <input value={listField(cons.marcas)} onChange={(e) =>
            setP({ ...p, consumidor: { ...cons, marcas: parseList(e.target.value) } })} /></div>
        <div className="row">
          <div><label>{t("editor.habitos_gasto")}</label>
            <input value={cons.habitos_gasto ?? ""} onChange={(e) =>
              setP({ ...p, consumidor: { ...cons, habitos_gasto: e.target.value } })} /></div>
          <div><label>{t("editor.sensibilidad_precio")}</label>
            <input value={cons.sensibilidad_precio ?? ""} onChange={(e) =>
              setP({ ...p, consumidor: { ...cons, sensibilidad_precio: e.target.value } })} /></div>
        </div>

        <h3>{t("editor.seccion_opinion")}</h3>
        <div><label>{t("editor.valores_vida")}</label>
          <input value={listField(op.valores_vida)} onChange={(e) =>
            setP({ ...p, opinion: { ...op, valores_vida: parseList(e.target.value) } })} /></div>
        <div><label>{t("editor.rasgos_personalidad")}</label>
          <input value={listField(op.rasgos_personalidad)} onChange={(e) =>
            setP({ ...p, opinion: { ...op, rasgos_personalidad: parseList(e.target.value) } })} /></div>

        <h3>{t("editor.seccion_tags_bio")}</h3>
        <div><label>{t("editor.tags")}</label>
          <input value={listField(p.tags)} onChange={(e) =>
            setP({ ...p, tags: parseList(e.target.value) })} /></div>
        <div><label>{t("editor.bio")}</label>
          <textarea rows={3} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></div>

        <Matices sd={sd} />

        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>{t("common.cancelar")}</button>
          <button onClick={save} disabled={saving || !p.nombre}>
            {saving ? t("common.guardando") : t("common.guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Sección "Matices" (solo lectura) del enriquecimiento A–H ----------

function Matices({ sd }: { sd: any }) {
  const { t } = useLocale();
  if (!sd?.enriquecido) return null;
  const A = sd.hogar_familia ?? {}, B = sd.vehiculos ?? {}, C = sd.banca ?? {},
        D = sd.seguros ?? {}, E = sd.telecom ?? {}, F = sd.digital ?? {},
        G = sd.laboral ?? {}, H = sd.consumo_habitos ?? {};
  const lista = (xs: any) => (Array.isArray(xs) && xs.length ? xs.join(", ") : "—");
  const veh = B.tiene_vehiculo
    ? [B.principal?.marca, B.principal?.modelo].filter(Boolean).join(" ")
      + ` · ${B.principal?.combustible ?? ""} · ${B.principal?.antiguedad_anios ?? "?"} años`
      + ` · ${B.principal?.adquisicion ?? ""} · ${B.principal?.financiacion ?? ""}`
    : t("matices.sin_vehiculo") + (B.usa_transporte_publico ? t("matices.usa_transporte") : "");
  const hijos = A.tiene_hijos
    ? `${A.num_hijos} (edades: ${lista(A.edades_hijos)})` + (A.monoparental ? " · monoparental" : "")
    : "Sin hijos";
  const colegio = A.tipo_colegio_hijos
    ? A.tipo_colegio_hijos + (A.colegio_nombre ? " · " + A.colegio_nombre : "") : "—";
  const polizas = (D.polizas ?? []).map((x: any) => `${x.tipo} (${x.compania})`).join(", ") || "—";
  const salud = D.salud ? `${D.salud.cobertura} · ${D.salud.compania}` : "—";
  const banco = (C.banco_principal ?? "—")
    + (C.bancos_secundarios?.length ? ` (+${C.bancos_secundarios.join(", ")})` : "");
  return (
    <>
      <h3>{t("matices.titulo")}</h3>
      <div className="muted" style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
        <p><strong>{t("matices.hogar")}:</strong> {A.convivencia} · vivienda: {A.regimen_vivienda} · hijos: {hijos}
          {" "}· colegio: {colegio} · mascotas: {A.mascotas}
          {A.cuida_dependientes ? " · cuida dependientes" : ""}
          {A.hijos_necesidades_especiales ? " · hijo con necesidades especiales" : ""}
          {A.hijos_adoptados ? " · hijo adoptado" : ""}</p>
        <p><strong>{t("matices.vehiculo")}:</strong> {veh}</p>
        <p><strong>{t("matices.banca")}:</strong> {banco} · {C.tipo} · productos: {lista(C.productos)}
          {" "}· endeudamiento: {C.nivel_endeudamiento} · {C.perfil_ahorro}</p>
        <p><strong>{t("matices.seguros")}:</strong> salud: {salud} · pólizas: {polizas}</p>
        <p><strong>{t("matices.telecom")}:</strong> {E.operador_movil} ({E.modalidad})
          {E.convergente_fibra ? " · fibra" : ""} · {E.smartphone}</p>
        <p><strong>{t("matices.digital")}:</strong> adopción {F.adopcion_digital} · redes: {lista(F.redes_sociales)}
          {" "}· streaming: {lista(F.streaming)}{F.compra_online ? " · compra online" : ""}</p>
        <p><strong>{t("matices.laboral")}:</strong> {G.situacion} · {G.tipo_contrato} · teletrabajo: {G.teletrabajo}
          {" "}· sector: {G.sector ?? "—"} · {G.tamano_empresa}</p>
        <p><strong>{t("matices.consumo")}:</strong> súper: {H.supermercado_habitual} · actividad: {H.actividad_fisica}
          {" "}· {H.fumador ? "fumador" : "no fumador"} · alcohol: {H.consumo_alcohol}</p>
      </div>
    </>
  );
}

// ---------- Modal de generación con IA ----------

function GenerateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { pais, country } = useCountry();
  const { t } = useLocale();
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
        <h2>{t("generar.titulo")}</h2>
        <div className="row">
          <div><label>{t("generar.cantidad")}</label>
            <input type="number" min={1} max={20} value={params.cantidad}
              onChange={(e) => setParams({ ...params, cantidad: +e.target.value })} /></div>
          <div><label>{t("generar.idioma")}</label>
            <input value={params.idioma} onChange={(e) => setParams({ ...params, idioma: e.target.value })} /></div>
          <div><label>{t("generar.pais")}</label>
            <input value={country.nombre} disabled title="Se cambia con el selector de país de la barra superior" /></div>
          <div><label>{t("generar.region")}</label>
            <select value={params.region ?? ""} onChange={(e) => setParams({ ...params, region: e.target.value || undefined })}>
              <option value="">{t("generar.cualquiera")}</option>
              {country.regiones.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
        </div>
        <div className="row">
          <div><label>{t("generar.edad_min")}</label>
            <input type="number" value={params.edad_min ?? ""}
              onChange={(e) => setParams({ ...params, edad_min: e.target.value ? +e.target.value : undefined })} /></div>
          <div><label>{t("generar.edad_max")}</label>
            <input type="number" value={params.edad_max ?? ""}
              onChange={(e) => setParams({ ...params, edad_max: e.target.value ? +e.target.value : undefined })} /></div>
          <div><label>{t("generar.segmento")}</label>
            <input value={params.segmento ?? ""} onChange={(e) => setParams({ ...params, segmento: e.target.value })} /></div>
        </div>
        <div><label>{t("generar.instrucciones")}</label>
          <textarea rows={2} value={params.instrucciones ?? ""}
            onChange={(e) => setParams({ ...params, instrucciones: e.target.value })} /></div>

        <div style={{ marginTop: "0.75rem" }}>
          <button onClick={generate} disabled={loading}>
            {loading ? t("generar.btn_generando") : t("generar.btn_generar")}
          </button>
        </div>

        {drafts && (
          <div style={{ marginTop: "1rem" }}>
            <div className="flex-between">
              <h3>{t("generar.borradores_titulo", { n: drafts.length })}</h3>
              <button className="secondary" onClick={saveAll}>{t("generar.guardar_todos")}</button>
            </div>
            {drafts.map((d, i) => (
              <div className="card" key={i}>
                <div className="flex-between">
                  <strong>{d.nombre}</strong>
                  <button onClick={() => saveDraft(i)} disabled={saved.has(i) || savingIdx === i}>
                    {saved.has(i) ? t("generar.guardada") : savingIdx === i ? "…" : t("common.guardar")}
                  </button>
                </div>
                <p className="muted">
                  {d.sociodemografico?.edad} años · {d.sociodemografico?.ocupacion} · {t("generar.vive_en")} {d.sociodemografico?.pais_residencia ?? "—"}
                  {d.sociodemografico?.pais_origen && d.sociodemografico?.pais_origen !== d.sociodemografico?.pais_residencia
                    ? ` (${t("generar.origen_short")}: ${d.sociodemografico?.pais_origen})` : ""}
                </p>
                <p style={{ fontSize: "0.85rem" }}>{d.bio}</p>
              </div>
            ))}
            <p className="muted">{t("generar.afinar")}</p>
          </div>
        )}

        <div className="flex-between" style={{ marginTop: "1rem" }}>
          <button className="secondary" onClick={onClose}>{t("common.cerrar")}</button>
        </div>
      </div>
    </div>
  );
}
