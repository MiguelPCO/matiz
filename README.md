# MATIZ

**Lee el color a ciegas.**

MATIZ es un juego de percepción del color: recibes una pista (una palabra o una foto), y tienes que localizar el matiz exacto que evoca dentro de una carta N×N en espacio OKLCH — sin ver el color de referencia en ningún momento. Cada tiro te acerca o te aleja; un termómetro te dice qué tan cerca estás, nunca en qué dirección. Juega en solitario contra tu propia precisión, o en modo Duelo hotseat pasando el móvil entre dos personas.

## Cómo se juega

1. **Pista** — escribes una palabra ("óxido", "menta") o subes una foto. El sistema deriva un color objetivo a partir de ella.
2. **Carta** — una cuadrícula de swatches en OKLCH, generada de forma determinista a partir de una seed, centrada alrededor del color objetivo.
3. **Tiros** — tocas una casilla; el termómetro te indica *qué tan cerca* estás (nunca la dirección) mediante distancia ΔE. Hasta 3 intentos, con pistas adicionales opcionales (luminosidad, saturación, dirección) que penalizan la puntuación.
4. **Reveal** — al acertar o agotar los tiros, la carta se congela, se ilumina el objetivo real y se revela la pista a todo color, con la puntuación desglosada.

En **Duelo**, cada jugador define una pista para el rival y adivina la suya propia; una Cortina a pantalla negra con desbloqueo por pulsación mantenida evita que un jugador vea el objetivo del otro por accidente. El desempate se resuelve por puntos → pistas usadas → tiros → distancia ΔE del mejor tiro, y se explica en pantalla.

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19 · TypeScript estricto (`noUncheckedIndexedAccess`) |
| Estilos | Tailwind CSS v4 |
| Animación | GSAP + `@gsap/react` |
| Color | Motor propio en espacio OKLCH (`lib/color.ts`) — sin dependencias |
| IA | Anthropic API (Claude) — deriva un color a partir de una palabra |
| Tests | Vitest |
| Paquetes | pnpm |

### Arquitectura

El estado del juego vive en un **reducer puro** (`lib/engine.ts`): `(state, action) => state`, sin I/O, sin aleatoriedad no determinista y completamente serializable (`JSON.stringify`/`parse` sin pérdida). Esta decisión es deliberada — el mismo motor está preparado para un futuro modo online (Supabase Realtime) sin reescritura, ya que el turno se identifica por `playerId`, nunca por índice hardcodeado.

```
lib/
  color.ts     → conversión y gamut mapping OKLCH ↔ sRGB, puro
  grid.ts      → generación determinista de la carta a partir de una seed
  engine.ts    → reducer del juego, motor puro
  thermo.ts    → mapeo de distancia ΔE al termómetro
  extract.ts   → extracción de color dominante desde una imagen (cliente)
  word-color.ts→ cliente del endpoint palabra → color
  gsap.ts      → helpers de animación (reduced-motion)
```

Toda animación (GSAP y CSS) se limita a `transform`, `opacity` y `clip-path` — nunca `filter` ni `stroke-dashoffset` — para mantener 60fps incluso en la coreografía del reveal, y respeta `prefers-reduced-motion` en todos los casos: el estado final renderizado es siempre el mismo, con o sin movimiento.

## Empezar

```bash
pnpm install
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Variables de entorno

La derivación de color a partir de una palabra requiere una clave de la API de Anthropic. Copia el ejemplo y añade la tuya:

```bash
cp .env.local.example .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
```

Sin clave configurada, el modo palabra falla con gracia y ofrece cambiar a modo imagen — el juego sigue siendo completamente jugable.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo (Turbopack) |
| `pnpm build` | Build de producción |
| `pnpm start` | Sirve el build de producción |
| `pnpm test` | Suite de tests (Vitest) |
| `pnpm typecheck` | Verificación de tipos (`tsc --noEmit`) |
| `pnpm lint` | ESLint |

## Estado del proyecto

Desarrollo por sprints — ver [`MATIZ-SPRINTS.md`](./MATIZ-SPRINTS.md) para el detalle completo de cada uno.

- [x] **Sprint 0** — Fundación: scaffold, tokens de diseño, motor de color y carta
- [x] **Sprint 1** — Bucle jugable en solitario, motor de juego
- [x] **Sprint 2** — Pantallas y navegación completas (Home, Setup, Cómo se juega)
- [x] **Sprint 3** — Coreografía de reveal con GSAP
- [ ] **Sprint 4** — Duelo hotseat
- [ ] **Sprint 5** — Accesibilidad, rendimiento y pulido de lanzamiento

## Documentación del proyecto

- [`MATIZ-PRD.md`](./MATIZ-PRD.md) — producto, objetivos y flujos de pantalla
- [`MATIZ-SCHEMA.md`](./MATIZ-SCHEMA.md) — contratos de tipos, estado y módulos
- [`MATIZ-SPRINTS.md`](./MATIZ-SPRINTS.md) — plan de sprints y criterios de aceptación
- [`START.md`](./START.md) — punto de entrada para retomar el proyecto

---

Proyecto personal de portfolio — Miguel.
