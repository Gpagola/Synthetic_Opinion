import { useState } from "react";
import { geoPath } from "d3-geo";
import { geoConicConformalSpain } from "d3-composite-projections";
import { feature } from "topojson-client";
import topo from "es-atlas/es/autonomous_regions.json";

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

const fc: any = feature(topo as any, (topo as any).objects.autonomous_regions);
const projection = geoConicConformalSpain().fitSize([W, H], fc);
const pathGen = geoPath(projection as any);
const borders = projection.getCompositionBorders();

export default function SpainChoropleth({ counts }: { counts: Record<string, number> }) {
  const [hover, setHover] = useState<{ region: string; n: number } | null>(null);
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {fc.features.map((f: any) => {
          const region = CODE2REGION[f.id] ?? f.properties?.name ?? "";
          const n = counts[region] ?? 0;
          const alpha = n ? 0.18 + 0.8 * (n / max) : 0.06;
          return (
            <path
              key={f.id}
              d={pathGen(f) ?? ""}
              fill={`rgba(91,140,255,${alpha})`}
              stroke="var(--border-strong)"
              strokeWidth={0.4}
              style={{ cursor: "default", transition: "fill 0.15s" }}
              onMouseEnter={() => setHover({ region, n })}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${region}: ${n}`}</title>
            </path>
          );
        })}
        <path d={borders} fill="none" stroke="var(--border)" strokeWidth={0.6} />
      </svg>
      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 6, minHeight: "1.2em" }}>
        {hover ? <span><strong style={{ color: "var(--text)" }}>{hover.region}</strong> · {hover.n} personas</span>
               : <span>Pasa el ratón por una comunidad</span>}
      </div>
    </div>
  );
}
