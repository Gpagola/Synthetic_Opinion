import { useEffect, useState } from "react";
import { geoPath } from "d3-geo";
import { geoConicConformalSpain } from "d3-composite-projections";
import { feature } from "topojson-client";
import ccaaTopo from "es-atlas/es/autonomous_regions.json";
import provTopo from "es-atlas/es/provinces.json";

// id INE de CCAA (es-atlas) -> nombre de comunidad usado en nuestros datos
const CODE2REGION: Record<string, string> = {
  "01": "Andalucía", "02": "Aragón", "03": "Principado de Asturias",
  "04": "Islas Baleares", "05": "Canarias", "06": "Cantabria",
  "07": "Castilla y León", "08": "Castilla-La Mancha", "09": "Cataluña",
  "10": "Comunidad Valenciana", "11": "Extremadura", "12": "Galicia",
  "13": "Comunidad de Madrid", "14": "Región de Murcia", "15": "Navarra",
  "16": "País Vasco", "17": "La Rioja", "18": "Ceuta", "19": "Melilla",
};

const W = 320;
const H = 250;

function build(topo: any, objKey: string) {
  const fc: any = feature(topo, topo.objects[objKey]);
  const proj = geoConicConformalSpain().fitSize([W, H], fc);
  return { fc, path: geoPath(proj as any), borders: proj.getCompositionBorders() };
}
const CCAA = build(ccaaTopo as any, "autonomous_regions");
const PROV = build(provTopo as any, "provinces");

// Rampa de azules por tema: el azul más oscuro queda en el MÁX (claro) y en el MÍN (oscuro)
const RAMP: Record<string, { min: number[]; max: number[] }> = {
  light: { min: [223, 234, 255], max: [9, 41, 112] },   // claro -> oscuro
  dark: { min: [20, 40, 88], max: [132, 178, 255] },     // oscuro -> claro
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

export default function SpainChoropleth({
  byRegion,
  byProvince,
}: {
  byRegion: Record<string, number>;
  byProvince: Record<string, number>;
}) {
  const [level, setLevel] = useState<"ccaa" | "prov">("ccaa");
  const [hover, setHover] = useState<{ label: string; n: number } | null>(null);
  const theme = useThemeName();
  const ramp = RAMP[theme] ?? RAMP.dark;

  const isC = level === "ccaa";
  const g = isC ? CCAA : PROV;
  const counts = isC ? byRegion : byProvince;
  const keyOf = (f: any) => (isC ? CODE2REGION[f.id] ?? f.properties?.name ?? "" : f.id);
  const labelOf = (f: any) => (isC ? CODE2REGION[f.id] ?? f.properties?.name : f.properties?.name) ?? "";
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div>
      <div className="dest-chips" style={{ marginBottom: 8 }}>
        <button type="button" className={isC ? "chip active" : "chip"} onClick={() => setLevel("ccaa")}>Comunidades</button>
        <button type="button" className={!isC ? "chip active" : "chip"} onClick={() => setLevel("prov")}>Provincias</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {g.fc.features.map((f: any) => {
          const n = counts[keyOf(f)] ?? 0;
          const t = n ? n / max : 0;
          return (
            <path
              key={f.id}
              d={g.path(f) ?? ""}
              fill={mix(ramp.min, ramp.max, t)}
              stroke="var(--border-strong)"
              strokeWidth={isC ? 0.4 : 0.25}
              style={{ transition: "fill 0.15s" }}
              onMouseEnter={() => setHover({ label: labelOf(f), n })}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${labelOf(f)}: ${n}`}</title>
            </path>
          );
        })}
        <path d={g.borders} fill="none" stroke="var(--border)" strokeWidth={0.6} />
      </svg>
      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 6, minHeight: "1.2em" }}>
        {hover
          ? <span><strong style={{ color: "var(--text)" }}>{hover.label}</strong> · {hover.n} personas</span>
          : <span>Pasa el ratón por {isC ? "una comunidad" : "una provincia"}</span>}
      </div>
    </div>
  );
}
