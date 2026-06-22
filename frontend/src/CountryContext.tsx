import { createContext, useContext, useEffect, useState } from "react";
import { CountryCode, getCountry, CountryConfig } from "./countries";

interface CountryCtx {
  pais: CountryCode;
  setPais: (c: CountryCode) => void;
  country: CountryConfig;
}

const Ctx = createContext<CountryCtx | null>(null);

const STORAGE_KEY = "pais";

function initialPais(): CountryCode {
  const saved = (localStorage.getItem(STORAGE_KEY) ?? "").toUpperCase();
  return getCountry(saved).codigo;
}

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [pais, setPaisState] = useState<CountryCode>(initialPais);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, pais);
  }, [pais]);

  const setPais = (c: CountryCode) => setPaisState(getCountry(c).codigo);

  return (
    <Ctx.Provider value={{ pais, setPais, country: getCountry(pais) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCountry(): CountryCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCountry debe usarse dentro de <CountryProvider>");
  return v;
}
