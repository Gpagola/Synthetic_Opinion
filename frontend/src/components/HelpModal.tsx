import { useCountry } from "../CountryContext";
import { useLocale } from "../locales/index";

export default function HelpModal({ onClose }: { onClose: () => void }) {
  const { country } = useCountry();
  const { t, locale } = useLocale();
  const adj = locale === "en" ? country.adjetivoEN : country.gentilicio;
  const fuente = country.fuenteDemografica;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>{t("help.titulo")}</h2>
          <button className="secondary" onClick={onClose}>{t("help.btn_cerrar")}</button>
        </div>

        <p className="muted">
          <strong>Personæ</strong> {t("help.intro", { adj, fuente })}
        </p>

        <h3>{t("help.section_poblacion")}</h3>
        <ul className="help-list">
          <li>{t("help.pop_lista")}</li>
          <li>{t("help.pop_generar")}</li>
          <li>{t("help.pop_nueva")}</li>
          <li>{t("help.pop_fichas")}</li>
          <li>{t("help.pop_interactivas")}</li>
          <li>{t("help.pop_mapa")}</li>
          <li>{t("help.pop_educacion")}</li>
        </ul>

        <h3>{t("help.section_focus")}</h3>
        <ul className="help-list">
          <li>{t("help.focus_recruiting")}</li>
          <li>{t("help.focus_chat")}</li>
          <li>{t("help.focus_orden")}</li>
          <li>{t("help.focus_interrumpir")}</li>
          <li>{t("help.focus_informe")}</li>
        </ul>

        <h3>{t("help.section_encuestas")}</h3>
        <ul className="help-list">
          <li>{t("help.enc_cuestionario")}</li>
          <li>{t("help.enc_muestra", { fuente })}</li>
          <li>{t("help.enc_modelo")}</li>
          <li>{t("help.enc_resultados")}</li>
          <li>{t("help.enc_cruces")}</li>
          <li>{t("help.enc_exportar")}</li>
        </ul>

        <h3>{t("help.section_apariencia")}</h3>
        <ul className="help-list">
          <li>{t("help.ap_tema")}</li>
        </ul>

        <h3>{t("help.section_ia")}</h3>
        <ul className="help-list">
          <li>{t("help.ia_focus")}</li>
          <li>{t("help.ia_personas")}</li>
          <li>{t("help.ia_encuestas")}</li>
        </ul>

        <p className="muted" style={{ marginTop: "0.75rem" }}>
          {t("help.datos_calidad", { adj, fuente })}
        </p>

        <h3>{t("help.conclusion_titulo")}</h3>
        <p className="muted">{t("help.conclusion_texto")}</p>
        <p className="muted">{t("help.conclusion_frase")}</p>
      </div>
    </div>
  );
}
