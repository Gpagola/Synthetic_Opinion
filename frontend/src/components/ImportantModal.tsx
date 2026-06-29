import { useCountry } from "../CountryContext";
import { useLocale } from "../locales/index";

export default function ImportantModal({ onClose }: { onClose: () => void }) {
  const { country } = useCountry();
  const { t } = useLocale();
  const fuente = country.fuenteDemografica;

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
            {t("imp.titulo")}
          </h2>
          <button className="secondary" onClick={onClose}>{t("imp.btn_cerrar")}</button>
        </div>

        <p>{t("imp.intro", { fuente })}</p>

        <h3>{t("imp.util_titulo")}</h3>
        <ul className="help-list">
          <li>{t("imp.util_1")}</li>
          <li>{t("imp.util_2")}</li>
          <li>{t("imp.util_3")}</li>
          <li>{t("imp.util_4")}</li>
          <li>{t("imp.util_5")}</li>
        </ul>

        <h3 className="h3-danger">{t("imp.no_util_titulo")}</h3>
        <ul className="help-list">
          <li>{t("imp.no_util_1")}</li>
          <li>{t("imp.no_util_2")}</li>
          <li>{t("imp.no_util_3")}</li>
          <li>{t("imp.no_util_4")}</li>
          <li>{t("imp.no_util_5")}</li>
        </ul>

        <p className="muted" style={{ marginTop: "0.75rem" }}>
          {t("imp.footer")}
        </p>
      </div>
    </div>
  );
}
