import { useCountry } from "../CountryContext";

export default function ImportantModal({ onClose }: { onClose: () => void }) {
  const { country } = useCountry();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal important-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="warn-ico">
              <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
            Importante
          </h2>
          <button className="secondary" onClick={onClose}>Cerrar</button>
        </div>

        <p>
          <strong>Personæ trabaja con poblaciones sintéticas generadas por inteligencia
          artificial</strong>, modeladas según datos demográficos oficiales ({country.fuenteDemografica}). Los perfiles son <strong>ficticios</strong>
          {" "}—no corresponden a personas reales ni contienen datos personales identificables— y sus
          respuestas en focus groups y encuestas son <strong>opiniones simuladas</strong>. Úsalo con
          criterio profesional, como insumo cualitativo y exploratorio.
        </p>

        <h3>Para qué es útil</h3>
        <ul className="help-list">
          <li><strong>Exploración y generación de hipótesis.</strong> Reacciones cualitativas tempranas
            a un concepto, naming, claim o packaging; descubre objeciones y ángulos no anticipados.</li>
          <li><strong>Pre-test y filtrado.</strong> Cribar muchos conceptos para decidir cuáles llevar a
            campo real. Coste del error bajo, velocidad alta.</li>
          <li><strong>Stress-test de instrumentos.</strong> Pasar guiones y cuestionarios por la
            población sintética para detectar ambigüedades y sesgos antes de programar el campo.</li>
          <li><strong>Formación y simulación interna.</strong> Entrenar equipos comerciales/producto,
            ensayar objeciones, role-play por segmentos.</li>
          <li><strong>Nichos inaccesibles.</strong> Primera aproximación direccional cuando reclutar el
            segmento real es caro o lento.</li>
        </ul>

        <h3 className="h3-danger">Para qué NO es útil (o es arriesgado)</h3>
        <ul className="help-list">
          <li><strong>Decisiones que dependen de magnitudes precisas.</strong> Sizing, share,
            elasticidad de precio, forecast. Da cifras plausibles pero no calibradas.</li>
          <li><strong>Temas fuera del entrenamiento o muy locales.</strong> Actitudes emergentes o
            productos sin referente cultural: el modelo regresa a la media y aplana la varianza real
            (desaparece la cola de opiniones minoritarias o extremas).</li>
          <li><strong>Alto riesgo regulatorio, legal o reputacional.</strong> Pharma, finanzas, salud
            pública, claims defendibles: se necesita evidencia real.</li>
          <li><strong>Go/no-go de inversión.</strong> Nunca como única fuente para una decisión de gran
            impacto.</li>
          <li><strong>Emociones profundas, tabúes y la brecha decir-vs-hacer.</strong> Lo sintético
            amplifica el sesgo de deseabilidad social.</li>
        </ul>

        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Herramienta de uso interno de Braintrust CS.
        </p>
      </div>
    </div>
  );
}
