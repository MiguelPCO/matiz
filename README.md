# MATIZ

**Lee el color a ciegas.**

🔗 [matiz-eight.vercel.app](https://matiz-eight.vercel.app)

MATIZ es un juego de percepción del color: recibes una pista (una palabra o una foto), y tienes que localizar el matiz exacto que evoca dentro de una carta N×N en espacio OKLCH — sin ver el color de referencia en ningún momento. Cada tiro te acerca o te aleja; un termómetro te dice qué tan cerca estás, nunca en qué dirección. Juega en solitario contra tu propia precisión, en modo Duelo hotseat pasando el móvil entre dos personas, o en modo Diario: un matiz compartido al día, igual para todos.

## Cómo se juega

1. **Pista** — escribes una palabra ("óxido", "menta") o subes una foto. El sistema deriva un color objetivo a partir de ella.
2. **Carta** — una cuadrícula de swatches en OKLCH, generada de forma determinista a partir de una seed, centrada alrededor del color objetivo.
3. **Tiros** — tocas una casilla; el termómetro te indica *qué tan cerca* estás (nunca la dirección) mediante distancia ΔE. Hasta 3 intentos, con pistas adicionales opcionales (luminosidad, saturación, dirección) que penalizan la puntuación.
4. **Reveal** — al acertar o agotar los tiros, la carta se congela, se ilumina el objetivo real y se revela la pista a todo color, con la puntuación desglosada.

En **Duelo**, cada jugador define una pista para el rival y adivina la suya propia; una Cortina a pantalla negra con desbloqueo por pulsación mantenida evita que un jugador vea el objetivo del otro por accidente. El desempate se resuelve por puntos → pistas usadas → tiros → distancia ΔE del mejor tiro, y se explica en pantalla.

En **Diario**, la fecha local genera la carta y la pista del día; el resultado se guarda en el navegador (un intento por día) y se comparte como tarjeta de texto, estilo Wordle. Con cuenta Google opcional, las estadísticas se sincronizan entre dispositivos.

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19 · TypeScript estricto (`noUncheckedIndexedAccess`) |
| Estilos | Tailwind CSS v4 |
| Animación | GSAP + `@gsap/react` |
| Color | Motor propio en espacio OKLCH (`lib/color.ts`) — sin dependencias |
| IA | Anthropic API (Claude Haiku 4.5) — palabra → color y color → palabra |
| Cuentas | Supabase (Google OAuth, opcional, solo sincroniza Diario) |
| Métricas | Vercel Analytics + Speed Insights |
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

## Decisiones técnicas

- **OKLCH como formato canónico.** La carta varía luminosidad y croma con el tono fijo; en OKLCH los pasos se perciben iguales, en HSL no. Los hex son solo salida. La distancia del termómetro es ΔE en OKLab.
- **El termómetro dice cuánto, nunca dónde.** Dar dirección convertiría el juego en una búsqueda binaria. Por la misma razón no hay verde-éxito ni rojo-error en ninguna parte: el único feedback de color es el termómetro.
- **La carta no se guarda, se deriva.** El estado lleva un `GridSpec` (seed + parámetros) y `buildGrid` reconstruye la misma carta siempre. Un test recorre 100 seeds para garantizarlo, y otro que ningún par de vecinos baje del paso mínimo perceptible.
- **Motor puro y serializable.** `lib/engine.ts` es un reducer sin I/O; el color de la pista se resuelve en la UI antes de despachar. El turno es un `playerId`: el mismo motor sirve para un futuro modo online sin reescritura.
- **Cortina de duelo con pulsación mantenida (1,2 s).** Un toque accidental no revela la pantalla del rival; funciona también con Enter/Espacio sostenido.
- **Animación solo con `transform`, `opacity` y `clip-path`.** El reveal de la foto, que el PRD describía como `grayscale`, es un cross-fade de dos imágenes apiladas: mismo efecto, sin animar `filter`.
- **Diario sin tocar el motor.** Su reducer propio espeja `applyGuess`/`applyHint`; la fecha local pasa por FNV-1a para obtener la seed del día. Cero cambios en `lib/engine.ts`.
- **Claude detrás de un único dueño.** Cliente y modelo viven en `lib/claude.ts`; una regla ESLint impide fijar `model` o `temperature` en las rutas, porque `temperature` rompió producción una vez.
- **Accesibilidad.** Cada casilla se anuncia como «Fila R, columna C»; foco ámbar visible; todo el juego se recorre con teclado; las áreas táctiles llegan a 44 px sin cambiar el tamaño visible (en 8×8 la casilla absorbe el hueco hasta su vecina, sin solaparla). El juego es de discriminación cromática y lo dice: «Cómo se juega» incluye una declaración honesta sobre daltonismo.
- **Datos legales fuera del repo.** Titular, NIF, domicilio y email de `/privacidad` y `/aviso-legal` vienen de variables de entorno, porque el repo es público.

## Empezar

```bash
pnpm install
pnpm dev -p 4000
```

Abre [http://localhost:4000](http://localhost:4000).

### Variables de entorno

La derivación de color a partir de una palabra requiere una clave de la API de Anthropic. Copia el ejemplo y añade la tuya:

```bash
cp .env.local.example .env.local
```

```
ANTHROPIC_API_KEY=sk-ant-...
# opcionales: cuenta Google para Diario
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# datos del titular en /privacidad y /aviso-legal (sin ellos: «[pendiente]»)
LEGAL_OWNER=...
LEGAL_NIF=...
LEGAL_ADDRESS=...
LEGAL_EMAIL=...
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
| `pnpm check` | typecheck + lint + tests — lo que corre CI en cada PR |

## Estado del proyecto

Desarrollo por sprints — ver [`MATIZ-SPRINTS.md`](./MATIZ-SPRINTS.md) para el detalle completo de cada uno.

- [x] **Sprint 0** — Fundación: scaffold, tokens de diseño, motor de color y carta
- [x] **Sprint 1** — Bucle jugable en solitario, motor de juego
- [x] **Sprint 2** — Pantallas y navegación completas (Home, Setup, Cómo se juega)
- [x] **Sprint 3** — Coreografía de reveal con GSAP
- [x] **Sprint 4** — Duelo hotseat
- [x] **Sprint 5** — Accesibilidad, rendimiento y pulido de lanzamiento (falta la prueba en móvil real)
- [x] **Sprint 6** — Modo Diario

## Rendimiento

Auditado con Lighthouse (mobile) contra producción:

| Categoría | Score |
|---|---|
| Performance | 99 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |

LCP 1.7s · CLS 0 · TBT 70ms · TTI 2.8s — sobre el presupuesto de Sprint 5 (LCP < 2.5s, CLS < 0.1) sin necesidad de optimización adicional en la Home. El score de accesibilidad es automatizado; el recorrido completo por teclado (Solo y Duelo, cortina incluida) y las áreas táctiles se verificaron a mano en navegador real. Interacciones en la carta por debajo de 16 ms.

## Documentación del proyecto

- [`MATIZ-PRD.md`](./MATIZ-PRD.md) — producto, objetivos y flujos de pantalla
- [`MATIZ-SCHEMA.md`](./MATIZ-SCHEMA.md) — contratos de tipos, estado y módulos
- [`MATIZ-SPRINTS.md`](./MATIZ-SPRINTS.md) — plan de sprints y criterios de aceptación
- [`START.md`](./START.md) — punto de entrada para retomar el proyecto

---

Proyecto personal de portfolio — Miguel.
