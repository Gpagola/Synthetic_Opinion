import { useEffect, useState } from "react";
import { geoPath, geoMercator } from "d3-geo";
import clGeo from "../assets/chile-regiones.geo.json";

// codregion (INE Chile) -> nombre de región canónico usado en nuestros datos
// (debe coincidir EXACTAMENTE con app/countries.py · regiones de Chile).
const CODE2REGION: Record<number, string> = {
  15: "Región de Arica y Parinacota",
  1: "Región de Tarapacá",
  2: "Región de Antofagasta",
  3: "Región de Atacama",
  4: "Región de Coquimbo",
  5: "Región de Valparaíso",
  13: "Región Metropolitana de Santiago",
  6: "Región del Libertador General Bernardo O'Higgins",
  7: "Región del Maule",
  16: "Región de Ñuble",
  8: "Región del Biobío",
  9: "Región de La Araucanía",
  14: "Región de Los Ríos",
  10: "Región de Los Lagos",
  11: "Región de Aysén del General Carlos Ibáñez del Campo",
  12: "Región de Magallanes y de la Antártica Chilena",
};

// Chile continental es largo y estrecho. Lo mostramos APAISADO (de lado a
// lado): rotamos la proyección 90° de modo que el norte (Arica) quede a la
// izquierda y la Patagonia (sur) a la derecha, ajustado a todo el ancho.
const W = 960;
const H = 210;

const fc: any = clGeo as any;
const proj = geoMercator().angle(90).fitSize([W, H], fc);
const path = geoPath(proj as any);

const RAMP: Record<string, { min: number[]; max: number[] }> = {
  light: { min: [223, 233, 255], max: [29, 78, 216] },
  dark: { min: [30, 41, 66], max: [56, 189, 248] },
};

function useThemeName(): string {
  const [t, setT] = useState(() => document.documentElement.dataset.theme || "dark");
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setT(document.documentElement.dataset.theme || "dark"));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return t;
}

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function ChileChoropleth({
  byRegion,
  selectedRegion,
  onSelect,
}: {
  byRegion: Record<string, number>;
  selectedRegion?: string;
  onSelect?: (key: string, label: string) => void;
}) {
  const [hover, setHover] = useState<{ label: string; n: number } | null>(null);
  const theme = useThemeName();
  const ramp = RAMP[theme] ?? RAMP.dark;

  const keyOf = (f: any) => CODE2REGION[f.properties?.codregion] ?? f.properties?.Region ?? "";
  const max = Math.max(1, ...Object.values(byRegion));

  return (
    <div>
      <div className="dest-chips" style={{ marginBottom: 8 }}>
        <button type="button" className="chip active">Regiones</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {fc.features.map((f: any, i: number) => {
          const key = keyOf(f);
          const n = byRegion[key] ?? 0;
          const t = n ? n / max : 0;
          const sel = !!selectedRegion && key === selectedRegion;
          return (
            <path
              key={f.properties?.codregion ?? i}
              d={path(f) ?? ""}
              fill={mix(ramp.min, ramp.max, t)}
              stroke={sel ? "var(--text)" : "var(--border-strong)"}
              strokeWidth={sel ? 1.2 : 0.4}
              style={{ transition: "fill 0.15s", cursor: onSelect ? "pointer" : "default" }}
              onMouseEnter={() => setHover({ label: key, n })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(key, key)}
            >
              <title>{`${key}: ${n}`}</title>
            </path>
          );
        })}
      </svg>
      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 6, minHeight: "1.2em" }}>
        {hover
          ? <span><strong style={{ color: "var(--text)" }}>{hover.label}</strong> · {hover.n} personas · clic para filtrar</span>
          : <span>Clic en una región para filtrar</span>}
      </div>
    </div>
  );
}
