export default function ImportantModal({ onClose }: { onClose: () => void }) {
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
          artificial</strong>, modeladas según datos del INE. Los perfiles son <strong>ficticios</strong>
          {" "}—no corresponden a personas reales ni contienen datos personales identificables— y sus
          respuestas en focus groups y encuestas son <strong>opiniones simuladas</strong>.
        </p>

        <ul className="help-list">
          <li><strong>Para qué sirve.</strong> Explorar hipótesis, afinar preguntas, anticipar
            reacciones y orientar el diseño de una investigación.</li>
          <li><strong>Qué no es.</strong> No sustituye el trabajo de campo con personas reales ni debe
            usarse como dato poblacional definitivo o evidencia concluyente.</li>
          <li><strong>Cómo interpretarlo.</strong> Con criterio profesional, como insumo cualitativo y
            exploratorio, contrastándolo siempre que la decisión lo requiera.</li>
        </ul>

        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Herramienta de uso interno de Braintrust CS.
        </p>
      </div>
    </div>
  );
}
