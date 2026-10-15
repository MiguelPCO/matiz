# SKILLMAP: qué skill usar en cada fase

Mezcla de Matt Pocock (plugin `mattpocock-skills`) y pstack (copiados en `.claude/skills/`).
Antes de una tarea no trivial, localiza la fase y sigue la cadena en orden. Mapa visual: ver README del piloto.

## Plan

Matt para ideas nuevas (grill → spec → tickets); pstack para entender código que ya existe antes de tocarlo.

- **Idea nueva → tickets**: `/grill-with-docs` (Matt) → `/to-spec` (Matt) → `/to-tickets` (Matt)
- **Entender código existente**: `/how` (pstack) → `/why` (pstack) → `/teach` (pstack)
- **Trabajo grande y difuso**: `/wayfinder` (Matt) → `/to-spec` (Matt)
- **Respuestas que te faltan**: `/research` (Matt) → `/to-questionnaire` (Matt)

## Design

Fija las palabras (domain-modeling) y luego la forma: tipos y firmas antes del código (architect).

- **Palabras y forma del código**: `/domain-modeling` (Matt) → `/architect` (pstack)
- **Probar con código desechable**: `/prototype` (Matt)
- **Diseño de módulos**: `/codebase-design` (Matt)

## Build

Pasos pequeños test-first. Si dos arreglos fallan igual, ataca la premisa. Limpia el diff antes de revisar.

- **Construir una pieza**: `/implement` (Matt) → `/tdd` (Matt) → `/typescript-best-practices` (pstack)
- **Cambio pequeño de UI**: `/grill-with-docs` (Matt) → `/implement` (Matt) → `/create-verification-skill` (pstack)
- **Construir el spec entero**: `/implement-spec` (Matt) → `/tdd` (Matt)
- **Bug difícil**: `/diagnosing-bugs` (Matt) → `/principle-attack-the-premise` (pstack)
- **Limpiar el diff**: `/deslop` (pstack) → `/no-comments` (pstack)

## Test

"Compila" no es evidencia: pruébalo en la app real con un skill verify del proyecto, y deja que otros modelos intenten romperlo.

- **Probarlo en la app real**: `/create-verification-skill` (pstack) → `/blast-radius` (pstack)
- **Revisar el cambio**: `/code-review` (Matt) → `/interrogate` (pstack) → `/thermo-nuclear-code-quality-review` (pstack)

## Deploy

PR fácil de revisar, comentarios y CI resueltos; lo que solo puede hacer un humano, guiado con wizard.

- **Abrir la PR**: `/pr` (Matt)
- **Hasta el merge**: `/get-pr-comments` (pstack) → `/fix-merge-conflicts` (pstack) → `/fix-ci` (pstack)
- **Pasos solo humanos**: `/wizard` (Matt)

## Maintain

Ordena issues, aprende de cada sesión (retro, correct) y mantén al día el mapa de verificación.

- **Ordenar issues**: `/triage` (Matt) → `/implement` (Matt)
- **Aprender de la sesión**: `/retro` (Matt) → `/improve-codebase-architecture` (Matt)
- **Fijar lecciones en reglas**: `/correct` (pstack)
- **Cuidar la verificación**: `/maintain-verification-skill` (pstack)

## Anytime

- **Router**: Te dice qué skill usar según tu situación. `/ask-matt` (Matt)
- **Ponerse al día**: Retomar contexto y explicarlo en llano. `/recall` (pstack), `/ketchup` (pstack), `/bro` (pstack), `/wait-what` (Matt)
- **Entrevistar**: Preguntas duras antes de decidir. `/grilling` (Matt), `/grill-me` (Matt)
- **Escribir**: Docs para agentes; quitar tics de IA. `/writing-for-agents` (Matt), `/unslop` (pstack)
- **Principios clave**: Reglas cortas que aplican en todas las fases. `/principle-prove-it-works` (pstack), `/principle-type-system-discipline` (pstack), `/principle-fix-root-causes` (pstack), `/principle-build-the-lever` (pstack), `/principle-test-behavior-not-implementation` (pstack), `/principle-guard-the-context-window` (pstack)

Requiere `mattpocock-skills@mattpocock` v1.3.1 (marketplace propio de Matt; el oficial sigue en 1.2.3).
Los principios `principle-*` son reglas: léelos cuando apliquen, no se "ejecutan".

## Lecciones del piloto (retro 2026-10-16)

- Cambio pequeño de UI: sáltate `/to-tickets` y `/tdd`; el skill verify en la app real aporta más.
- `/to-spec` y `/to-tickets` publican en un issue tracker: corre `/setup-matt-pocock-skills` una vez, o guarda el spec en `docs/superpowers/specs/`.
- `/code-review` + `/interrogate` lanzaron 6 agentes para ~30 líneas, pero solo uno cazó el bug real (Tab escapando del diálogo). Mantén varios modelos en `/interrogate`.
- Los skills de Matt no salen en la lista del Skill tool: léelos de `~/.claude/plugins/cache/mattpocock/mattpocock-skills/1.3.1/skills/`.
- `/correct` en MATIZ: un dueño (`lib/claude.ts`, `hooks/useDialog.ts`) + regla ESLint + CI `pnpm check`; tabla de reglas en `CLAUDE.md`.
