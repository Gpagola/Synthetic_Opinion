import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCountry } from "../CountryContext";
import { CountryCode } from "../countries";
import { useLocale } from "../locales/index";

/** Orbe de malla deformada + halo de partículas, dibujado en canvas (sin libs). */
function Orb() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0;

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const LAT = 30, LON = 54;
    // Halo de partículas alrededor de la esfera (direcciones aleatorias).
    const halo = Array.from({ length: 460 }, () => {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u), r = 1.02 + Math.random() * 0.95;
      return { x: s * Math.cos(t) * r, y: u * r, z: s * Math.sin(t) * r,
               a: 0.15 + Math.random() * 0.5 };
    });

    // Ratón: posición normalizada [-1,1] (target + suavizado) y "energía" por velocidad.
    const m = { tx: 0, ty: 0, x: 0, y: 0, energy: 0 };
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      m.energy = Math.min(1, m.energy + Math.hypot(nx - m.tx, ny - m.ty) * 1.6);
      m.tx = nx; m.ty = ny;
    };
    window.addEventListener("mousemove", onMove);

    const start = performance.now();
    const draw = (now: number) => {
      const time = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;

      // Suavizado del ratón y decaimiento de la energía.
      m.x += (m.tx - m.x) * 0.06; m.y += (m.ty - m.y) * 0.06; m.energy *= 0.93;

      // La rotación SIGUE al cursor (además del giro continuo).
      const ay = time * 0.16 + m.x * 0.9;
      const ax = 0.14 + m.y * 0.7 + Math.sin(time * 0.13) * 0.12;
      const cY = Math.cos(ay), sY = Math.sin(ay), cX = Math.cos(ax), sX = Math.sin(ax);

      // Dirección del cursor en espacio de vista (hacia la cámara) → bulto.
      const md = Math.hypot(m.x, -m.y, 0.85);
      const mdx = m.x / md, mdy = -m.y / md, mdz = 0.85 / md;
      const bulge = 0.28 + m.energy * 0.25;          // intensidad del bulto
      const morph = 1 + m.energy * 1.4;              // ondulación según velocidad

      const project = (x: number, y: number, z: number) => {
        const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
        const y2 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        // Bulto hacia el cursor: empuja hacia fuera la cara que mira al puntero.
        const n = Math.hypot(x1, y2, z2) || 1;
        const d = Math.max(0, (x1 * mdx + y2 * mdy + z2 * mdz) / n);
        const k = 1 + bulge * d * d;
        const p = 1 / (1.9 - z2 * 0.42);
        return { sx: cx + x1 * R * p * k, sy: cy + y2 * R * p * k, z: z2 };
      };
      // Deformación suave ("blobby" que respira), amplificada por el movimiento del ratón.
      const rad = (th: number, ph: number) =>
        1 + morph * (0.10 * Math.sin(3 * th + time * 0.6)
                   + 0.08 * Math.cos(2 * ph - time * 0.5)
                   + 0.05 * Math.sin(4 * ph + 2 * th));

      const grid: { sx: number; sy: number; z: number }[][] = [];
      for (let i = 0; i <= LAT; i++) {
        const th = (i / LAT) * Math.PI; const row = [];
        for (let j = 0; j <= LON; j++) {
          const ph = (j / LON) * Math.PI * 2, r = rad(th, ph);
          row.push(project(Math.sin(th) * Math.cos(ph) * r,
                           Math.cos(th) * r,
                           Math.sin(th) * Math.sin(ph) * r));
        }
        grid.push(row);
      }

      ctx.lineWidth = 0.6;
      const line = (a: any, b: any) => {
        const z = (a.z + b.z) / 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.17 * (z + 1) / 2})`;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      };
      for (let i = 0; i <= LAT; i++)
        for (let j = 0; j <= LON; j++) {
          if (j < LON) line(grid[i][j], grid[i][j + 1]);
          if (i < LAT) line(grid[i][j], grid[i + 1][j]);
        }
      for (let i = 0; i <= LAT; i++)
        for (let j = 0; j <= LON; j++) {
          const p = grid[i][j];
          if (p.z > -0.3) {
            ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.55 * (p.z + 1) / 2})`;
            ctx.fillRect(p.sx - 0.6, p.sy - 0.6, 1.2, 1.2);
          }
        }
      for (const pt of halo) {
        const p = project(pt.x, pt.y, pt.z);
        ctx.fillStyle = `rgba(255,255,255,${pt.a * (0.35 + 0.65 * (p.z + 1) / 2)})`;
        const s = p.z > 0 ? 1.5 : 0.9;
        ctx.fillRect(p.sx - s / 2, p.sy - s / 2, s, s);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);
  return <canvas ref={ref} className="orb-canvas" aria-hidden="true" />;
}

/** Logo Andersen (imagen pública en frontend/public/andersen-consulting.png);
 *  si el archivo no existe, cae a texto blanco para no mostrar imagen rota. */
function AndersenCredit() {
  const [ok, setOk] = useState(true);
  const src = `${import.meta.env.BASE_URL}andersen-consulting.png`;
  return (
    <div className="landing-credit">
      <img src={src} alt="Andersen Consulting" className="landing-credit-logo"
           onError={() => setOk(false)} style={{ display: ok ? "block" : "none" }} />
      {!ok && <span>Andersen Consulting</span>}
    </div>
  );
}

export default function Landing() {
  const { setPais } = useCountry();
  const nav = useNavigate();
  const { t } = useLocale();
  const go = (c: CountryCode) => { setPais(c); nav("/personas"); };
  return (
    <div className="landing">
      <Orb />
      <AndersenCredit />
      <div className="landing-content">
        <h1 className="landing-title">Personæ</h1>
        <p className="landing-tagline">{t("landing.tagline")}</p>
        <div className="landing-cards">
          <button className="country-card" onClick={() => go("CL")}>CHILE</button>
          <button className="country-card" onClick={() => go("ES")}>SPAIN</button>
        </div>
      </div>
    </div>
  );
}
