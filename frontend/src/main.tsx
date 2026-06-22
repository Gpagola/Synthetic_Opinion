import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, NavLink } from "react-router-dom";
import PersonasPage from "./pages/PersonasPage";
import FocusGroupsPage from "./pages/FocusGroupsPage";
import SurveysPage from "./pages/SurveysPage";
import HelpModal from "./components/HelpModal";
import ImportantModal from "./components/ImportantModal";
import { CountryProvider, useCountry } from "./CountryContext";
import { COUNTRY_LIST, CountryCode } from "./countries";
import "./styles.css";

function CountrySelect() {
  const { pais, setPais } = useCountry();
  return (
    <select
      className="country-select"
      value={pais}
      onChange={(e) => setPais(e.target.value as CountryCode)}
      title="País del escenario (población, focus y encuestas)"
      aria-label="País del escenario"
    >
      {COUNTRY_LIST.map((c) => (
        <option key={c.codigo} value={c.codigo}>{c.nombre}</option>
      ))}
    </select>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.dataset.theme || "dark"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const isDark = theme === "dark";
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label="Cambiar tema"
    >
      {isDark ? (
        // Sol (cambiar a claro)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" />
        </svg>
      ) : (
        // Luna (cambiar a oscuro)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function Logo() {
  return (
    <svg className="logo-mark" width="42" height="42" viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle className="lc1" cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.5" />
      <circle className="lc2" cx="20" cy="13" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.55" />
      <circle className="lc3" cx="16" cy="21" r="6.5" fill="currentColor" />
    </svg>
  );
}

function Layout() {
  const [help, setHelp] = useState(false);
  const [important, setImportant] = useState(false);
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Logo />
            <div className="brand-text">
              <span className="brand-name">Personæ</span>
              <span className="credit">
                Desarrollado por Braintrust CS firma miembro de Andersen Consulting
              </span>
            </div>
          </div>
          <nav>
            <NavLink to="/personas">Población</NavLink>
            <NavLink to="/focus-groups">Focus</NavLink>
            <NavLink to="/surveys">Encuestas</NavLink>
          </nav>
          <div style={{ flex: 1 }} />
          <div className="topbar-actions">
          <button className="important-btn" onClick={() => setImportant(true)} title="Aviso importante">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
            Importante
          </button>
          <button className="help-btn" onClick={() => setHelp(true)} title="Ayuda">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2.2-2.6 4" />
              <circle cx="12" cy="17.4" r="0.6" fill="currentColor" />
            </svg>
            Ayuda
          </button>
          <CountrySelect />
          <ThemeToggle />
          </div>
        </div>
      </header>
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {important && <ImportantModal onClose={() => setImportant(false)} />}
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/personas" replace />} />
          <Route path="/personas" element={<PersonasPage />} />
          <Route path="/focus-groups" element={<FocusGroupsPage />} />
          <Route path="/surveys" element={<SurveysPage />} />
        </Routes>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <CountryProvider>
        <Layout />
      </CountryProvider>
    </BrowserRouter>
  </React.StrictMode>
);
