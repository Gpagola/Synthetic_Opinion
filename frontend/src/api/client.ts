// Cliente de API. En dev, Vite hace proxy de /api -> http://localhost:8000
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export interface Sociodemografico {
  edad?: number | null;
  genero?: string | null;
  pais_origen?: string | null;
  pais_residencia?: string | null;
  region?: string | null;
  nivel_educativo?: string | null;
  ingresos?: string | null;
  ocupacion?: string | null;
  estado_civil?: string | null;
  hogar?: string | null;
}

export interface Consumidor {
  categorias_interes: string[];
  marcas: string[];
  habitos_gasto?: string | null;
  canales: string[];
  sensibilidad_precio?: string | null;
}

export interface Opinion {
  valores_vida: string[];
  actitudes: string[];
  rasgos_personalidad: string[];
  posicionamientos?: string | null;
}

export interface PersonaBase {
  nombre: string;
  idioma: string;
  tags: string[];
  sociodemografico: Sociodemografico;
  consumidor: Consumidor;
  opinion: Opinion;
  bio: string;
}

export interface Persona extends PersonaBase {
  id: number;
  origen: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerateParams {
  cantidad: number;
  pais?: string;
  region?: string;
  edad_min?: number;
  edad_max?: number;
  segmento?: string;
  idioma: string;
  instrucciones?: string;
}

export interface ResponseItem {
  id: number;
  question_id: number;
  persona_id: number;
  persona_nombre: string;
  texto: string;
  orden: number;
  created_at: string;
}

export interface QuestionItem {
  id: number;
  texto: string;
  tipo: string;
  persona_objetivo_id: number | null;
  destinatarios: number[];
  orden: number;
  responses: ResponseItem[];
}

export interface Member {
  persona_id: number;
  nombre: string;
}

export interface FocusGroup {
  id: number;
  nombre: string;
  descripcion: string;
  tema: string;
  idioma: string;
  estado: string;
  error_msg?: string | null;
  created_at: string;
  members: Member[];
  questions: QuestionItem[];
}

export interface Candidate {
  persona_id: number;
  nombre: string;
  edad?: number | null;
  pais_origen?: string | null;
  pais_residencia?: string | null;
  ocupacion?: string | null;
  tags: string[];
  motivo: string;
}

export interface Report {
  id: number;
  focus_group_id: number;
  contenido_markdown: string;
  metadatos: Record<string, unknown>;
  generated_at: string;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Personas
  generatePersonas: (p: GenerateParams) =>
    req<PersonaBase[]>("/personas/generate", { method: "POST", body: JSON.stringify(p) }),
  listPersonas: (q?: string) =>
    req<Persona[]>(`/personas${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createPersona: (p: PersonaBase & { origen?: string }) =>
    req<Persona>("/personas", { method: "POST", body: JSON.stringify(p) }),
  updatePersona: (id: number, p: Partial<PersonaBase>) =>
    req<Persona>(`/personas/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deletePersona: (id: number) =>
    req<void>(`/personas/${id}`, { method: "DELETE" }),

  // Focus groups
  listFocusGroups: () => req<FocusGroup[]>("/focus-groups"),
  createFocusGroup: (fg: Partial<FocusGroup>) =>
    req<FocusGroup>("/focus-groups", { method: "POST", body: JSON.stringify(fg) }),
  getFocusGroup: (id: number) => req<FocusGroup>(`/focus-groups/${id}`),
  deleteFocusGroup: (id: number) =>
    req<void>(`/focus-groups/${id}`, { method: "DELETE" }),
  setMembers: (id: number, persona_ids: number[]) =>
    req<FocusGroup>(`/focus-groups/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ persona_ids }),
    }),
  recruit: (id: number, perfil: string, cantidad: number) =>
    req<Candidate[]>(`/focus-groups/${id}/recruit`, {
      method: "POST",
      body: JSON.stringify({ perfil, cantidad }),
    }),
  recruitReplace: (id: number, perfil: string, exclude_ids: number[]) =>
    req<Candidate>(`/focus-groups/${id}/recruit/replace`, {
      method: "POST",
      body: JSON.stringify({ perfil, exclude_ids }),
    }),
  ask: (id: number, texto: string, destinatarios_ids: number[]) =>
    req<{ estado: string }>(`/focus-groups/${id}/ask`, {
      method: "POST",
      body: JSON.stringify({ texto, destinatarios_ids }),
    }),
  cancelAsk: (id: number) =>
    req<{ estado: string }>(`/focus-groups/${id}/cancel`, { method: "POST" }),
  getStatus: (id: number) =>
    req<{ estado: string; error_msg?: string | null; questions: QuestionItem[] }>(
      `/focus-groups/${id}/status`
    ),

  // Informes
  createReport: (id: number) =>
    req<Report>(`/focus-groups/${id}/report`, { method: "POST" }),
  getReport: (id: number) => req<Report>(`/focus-groups/${id}/report`),
  deleteReport: (id: number) =>
    req<void>(`/focus-groups/${id}/report`, { method: "DELETE" }),
  exportUrl: (id: number, format: "pdf" | "docx" | "xlsx") =>
    `${BASE}/focus-groups/${id}/report/export?format=${format}`,
};
