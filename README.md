# 🧠 Synthetic Opinion

Herramienta web para **investigación de mercados con personas sintéticas**:

1. **Biblioteca de personas** — crea perfiles sintéticos (sociodemográfico, consumo y opinión/valores). Generación **híbrida**: la IA propone borradores a partir de parámetros y tú editas cualquier campo. Las personas son reutilizables en cualquier número de focus groups.
2. **Focus groups** — selecciona personas, define preguntas (generales o uno-a-uno), lánzalo con un botón y obtén respuestas con **dinámica de grupo** (cada persona ve las respuestas previas y reacciona). Genera un **informe** descargable en **PDF, Word y Excel**.

## Arquitectura

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + TypeScript |
| Backend | FastAPI + SQLAlchemy |
| Base de datos | MySQL |
| LLM | OpenAI |

```
backend/   API FastAPI, modelos, servicios de IA, migraciones Alembic
frontend/  SPA React (páginas Personas y Focus Groups)
docker-compose.yml
```

## Requisitos

- Python 3.12+, Node 20+
- Una base de datos **MySQL** accesible
- Una **API key de OpenAI**

## Puesta en marcha (desarrollo)

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env       # edita DATABASE_URL y OPENAI_API_KEY

# Crear el esquema (elige una opción):
alembic upgrade head       # migraciones (recomendado)
# python init_db.py        # alternativa rápida sin Alembic

uvicorn app.main:app --reload --port 8000
```

API en http://localhost:8000 · docs en http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App en http://localhost:5173 (Vite hace proxy de `/api` → `:8000`).

## Despliegue con Docker (servidor en la nube)

La BBDD MySQL es externa (vuestro servidor). Solo se construyen backend + frontend.

```bash
cp backend/.env.example backend/.env   # DATABASE_URL apunta a vuestro MySQL
docker compose up -d --build
```

- Frontend: puerto **8080**
- Backend: puerto **8000** (aplica migraciones al arrancar)

## Variables de entorno (`backend/.env`)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | `mysql+pymysql://user:pass@host:3306/synthetic_opinion` |
| `OPENAI_API_KEY` | Clave de OpenAI |
| `OPENAI_MODEL` | Modelo (por defecto `gpt-4o`) |
| `OPENAI_TEMPERATURE` | Creatividad (por defecto `0.9`) |
| `CORS_ORIGINS` | Orígenes permitidos del frontend, separados por coma |

## Endpoints principales

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/personas/generate` | Genera borradores con IA (no guarda) |
| GET/POST | `/personas` | Listar / crear |
| PUT/DELETE | `/personas/{id}` | Editar / archivar (soft-delete) |
| GET/POST | `/focus-groups` | Listar / crear |
| POST | `/focus-groups/{id}/members` | Definir participantes |
| POST | `/focus-groups/{id}/questions` | Definir preguntas |
| POST | `/focus-groups/{id}/run` | Lanzar (tarea en segundo plano) |
| GET | `/focus-groups/{id}/status` | Estado + respuestas (polling) |
| POST | `/focus-groups/{id}/report` | Generar informe |
| GET | `/focus-groups/{id}/report/export?format=pdf\|docx\|xlsx` | Descargar |

## Notas

- La **dinámica de grupo** es secuencial: en una pregunta general las personas responden por orden, viendo las respuestas anteriores. Es algo más lenta y costosa en tokens, pero genera debate realista.
- Conviene **fijar límites de gasto** en la cuenta de OpenAI.
- El borrado de personas es **soft-delete** (`activo=false`): dejan de aparecer en los selectores pero se conservan sus respuestas e informes previos.
