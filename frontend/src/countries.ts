// Registro de países (escenarios) en el frontend. Espejo ligero de
// backend/app/countries.py: regiones, pirámide de cuotas (edad×sexo) y metadatos
// de presentación (mapa, fuente demográfica). Código ISO-2: "ES" | "CL".

export type CountryCode = "ES" | "CL";

// (etiqueta, edad_min, edad_max, % de adultos, % mujeres en la franja)
export type Band = [string, number, number, number, number];

export interface CountryConfig {
  codigo: CountryCode;
  nombre: string;
  nombreEN: string;
  gentilicio: string;
  adjetivoEN: string;
  fuenteDemografica: string;
  regiones: string[];
  pyramidBands: Band[];
  // Tipo de mapa territorial disponible para la población de este país.
  mapa: "es-choropleth" | "cl-choropleth";
}

const ES: CountryConfig = {
  codigo: "ES",
  nombre: "España",
  nombreEN: "Spain",
  gentilicio: "española",
  adjetivoEN: "Spanish",
  fuenteDemografica: "INE 2024",
  mapa: "es-choropleth",
  pyramidBands: [
    ["18-24", 18, 24, 0.08, 0.49],
    ["25-34", 25, 34, 0.14, 0.49],
    ["35-44", 35, 44, 0.18, 0.49],
    ["45-54", 45, 54, 0.19, 0.50],
    ["55-64", 55, 64, 0.17, 0.51],
    ["65-74", 65, 74, 0.13, 0.53],
    ["75-84", 75, 84, 0.08, 0.58],
    ["85-95", 85, 95, 0.03, 0.67],
  ],
  regiones: [
    "Andalucía", "Cataluña", "Comunidad de Madrid", "Comunidad Valenciana",
    "Galicia", "Castilla y León", "País Vasco", "Canarias", "Castilla-La Mancha",
    "Región de Murcia", "Aragón", "Islas Baleares", "Extremadura",
    "Principado de Asturias", "Navarra", "Cantabria", "La Rioja",
  ],
};

const CL: CountryConfig = {
  codigo: "CL",
  nombre: "Chile",
  nombreEN: "Chile",
  gentilicio: "chilena",
  adjetivoEN: "Chilean",
  fuenteDemografica: "Censo INE Chile 2024",
  mapa: "cl-choropleth",
  // Reparto de adultos 18+ coherente con el Censo 2024 INE (65+ ≈ 14%).
  pyramidBands: [
    ["18-24", 18, 24, 0.126, 0.49],
    ["25-34", 25, 34, 0.199, 0.50],
    ["35-44", 35, 44, 0.190, 0.50],
    ["45-54", 45, 54, 0.164, 0.51],
    ["55-64", 55, 64, 0.143, 0.53],
    ["65-74", 65, 74, 0.106, 0.55],
    ["75-84", 75, 84, 0.054, 0.58],
    ["85-95", 85, 95, 0.018, 0.66],
  ],
  // 16 regiones ordenadas por población (Censo 2024 INE).
  regiones: [
    "Región Metropolitana de Santiago", "Región de Valparaíso", "Región del Biobío",
    "Región del Maule", "Región de La Araucanía",
    "Región del Libertador General Bernardo O'Higgins", "Región de Los Lagos",
    "Región de Coquimbo", "Región de Antofagasta", "Región de Ñuble",
    "Región de Los Ríos", "Región de Tarapacá", "Región de Atacama",
    "Región de Arica y Parinacota",
    "Región de Magallanes y de la Antártica Chilena",
    "Región de Aysén del General Carlos Ibáñez del Campo",
  ],
};

export const COUNTRIES: Record<CountryCode, CountryConfig> = { ES, CL };

export const COUNTRY_LIST: CountryConfig[] = [ES, CL];

export function getCountry(code: string | null | undefined): CountryConfig {
  const c = (code ?? "").toUpperCase();
  return COUNTRIES[c as CountryCode] ?? ES;
}
