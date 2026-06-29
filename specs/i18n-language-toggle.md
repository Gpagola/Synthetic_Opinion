# Spec: Internacionalización — Toggle EN / ES

> **Estado:** Borrador  
> **Fecha:** 2026-06-28  
> **Autor:** Personæ / Braintrust

---

## Objetivo

La interfaz de Personæ está actualmente en español. El equipo necesita poder operar la plataforma en inglés americano sin perder la opción de volver al castellano de España. El cambio de idioma debe ser inmediato y persistente dentro del navegador, sin requerir gestión de sesiones ni cuentas de usuario.

## Usuarios y contexto

Consultores de Andersen Consulting / Braintrust que usan la app para crear y analizar población sintética. Algunos flujos de trabajo o presentaciones a clientes se realizan en inglés; otros, en español. El usuario alterna el idioma según el contexto de trabajo, sin salir de la app.

## Requerimientos

### Debe tener (MVP)

- Botón `EN | ES` visible en la barra de navegación superior, junto al enlace "Ayuda / Help".
- Al pulsar el botón, toda la UI estática cambia de idioma de forma instantánea (sin recarga de página).
- Idioma por defecto: **Español (ES)**.
- La preferencia se guarda en `localStorage` (`locale: "es" | "en"`) y se restaura en recargas posteriores.
- Cobertura total: **todas las páginas y todos los componentes** — Landing, Personas, Focus Groups, Encuestas (Diseño + Ejecución), modales, mensajes de error, placeholders, badges de estado, tooltips, textos de confirmación.
- Variante lingüística: **inglés americano** (US) y **castellano de España** (es-ES).
- Las traducciones se mantienen en archivos de recursos separados (`locales/en.ts` y `locales/es.ts`), organizados por sección, para facilitar mantenimiento.

### No incluye (out of scope)

- Traducción del contenido generado por IA (bios de personas sintéticas, informes de focus groups, respuestas de encuestas, intros de encuesta). Ese contenido se genera en el idioma configurado al momento de la creación y no cambia al alternar el toggle.
- Persistencia en base de datos / por usuario (no hay gestión de usuarios).
- Más de dos idiomas en esta versión.
- Traducciones automáticas via API (todo el texto se traduce manualmente en los archivos de recursos).

## Restricciones

- Frontend: **React 18 + TypeScript + Vite**.
- Sin librerías externas de i18n de gran tamaño (no `i18next` con todos sus plugins). Se puede usar `react-i18next` ligero, o una solución custom con `Context + hook` si el árbol de strings es manejable.
- Backend: sin cambios (los strings del backend son mensajes técnicos de error, no UI).
- El toggle debe integrarse en el componente de barra de navegación ya existente sin romper el layout.
- La selección guardada en `localStorage` debe ser el único mecanismo de persistencia — si localStorage no está disponible (modo incógnito extremo), la app carga en español sin error.

## Casos borde y errores

| Situación | Comportamiento esperado |
|-----------|------------------------|
| Key de traducción faltante en `en.ts` | Mostrar el string en español como fallback (nunca una key vacía o `undefined`) |
| `localStorage` no disponible | Cargar en español por defecto, sin excepción visible al usuario |
| Página cargada con `locale=en` en localStorage | Toda la UI arranca en inglés directamente, sin flash en español |
| Contenido generado por IA en medio de la UI | El texto AI permanece en su idioma original; solo el shell circundante (etiquetas, botones) cambia |
| Nuevo componente añadido al codebase sin strings traducidos | El linter / compilador TypeScript debe detectarlo (typing estricto de las keys) |

## Definición de done

- [ ] Botón `EN | ES` aparece en la barra de navegación junto a "Ayuda" en todas las páginas.
- [ ] Al pulsar `EN`, toda la UI estática (botones, títulos, labels, placeholders, mensajes de error, estados) cambia a inglés americano en la misma pantalla sin recarga.
- [ ] Al pulsar `ES`, la UI vuelve al castellano de España.
- [ ] La preferencia se guarda en `localStorage` y sobrevive a F5.
- [ ] Con `localStorage` vacío o borrado, la app carga en español.
- [ ] Ninguna página ni modal muestra texto mezclado (mitad en un idioma, mitad en otro) al cambiar el toggle.
- [ ] El contenido generado por IA (bios, informes, respuestas) no cambia al alternar el idioma.
- [ ] `npx tsc --noEmit` pasa sin errores tras el cambio.
- [ ] Las keys de traducción tienen tipado estricto en TypeScript: una key que no exista en ambos archivos es error de compilación.
- [ ] Probado manualmente en las páginas: Landing, lista de Personas, detalle de Persona, Focus Groups (lista + detalle + informe), Encuestas (lista + diseño + ejecución + resultados).
