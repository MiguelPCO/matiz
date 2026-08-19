# Sprint 3 — Coreografía del Reveal — Design

## Contexto

Sprint 0-2 completos: motor puro (`lib/engine.ts`), S3 Play juega de principio a fin, S0/S1/S6 navegables. El reveal (`round.status !== "playing"`) es hoy un estado final estático — swatches atenuados no existen, la foto ya está siempre en B/N, no hay línea, el score aparece de golpe. Sprint 3 lo convierte en la coreografía de 1,6 s de PRD §7.2.

SPRINTS §Sprint 3 y PRD §7.2/§8.3 son la fuente de verdad. Este doc resuelve dos conflictos reales del PRD y fija las decisiones de arquitectura que el PRD no especifica.

## Decisiones ya acordadas con Miguel

1. **`Reveal` es un componente de props puros**, no lee `useGame()`. Motivo: SPRINTS dice que el duelo (Sprint 4) reutiliza esta coreografía; construirlo genérico ahora evita reabrir el archivo en Sprint 4.
2. **Conflicto §8.3 vs §7.2 (filter):** §8.3 prohíbe animar `filter` (solo `transform`/`opacity`/`clip-path`, regla "no negociable" de rendimiento). §7.2 pide `grayscale(1)→(0)` en la foto. Resolución: dos `<img>` apiladas — B/N estática debajo, color encima con `opacity: 0→1`. Mismo resultado visual, cero `filter` animado.
3. **Conflicto §8.3 vs §7.2 (stroke-dashoffset):** la línea punteada tampoco es `transform`/`opacity`/`clip-path`. Resolución: la línea es un `<div>` con `border-top` punteado, no un SVG — posicionado y rotado vía medición DOM, animado solo con `scaleX(0→1)` (`transform-origin: left center`). Elimina la dependencia de SVG/DrawSVG por completo.

## Arquitectura

### Archivos nuevos
- **`lib/gsap.ts`** — `gsap.registerPlugin(useGSAP)` (el registro estándar de `@gsap/react`) + `prefersReducedMotion()` vía `matchMedia("(prefers-reduced-motion: reduce)")`.
- **`components/game/Reveal.tsx`** — el componente genérico. Props:
  ```ts
  interface RevealProps {
    readonly clue: Clue;
    readonly grid: Grid;
    readonly guesses: readonly Guess[];
    readonly best: Guess | null;
    readonly verdict: string;
    readonly score: number; // round.score no-null garantizado por el caller una vez status !== "playing"
    readonly breakdown: { readonly base: number; readonly penalty: number };
    readonly actionLabel: string;
    readonly onAction: () => void;
  }
  ```
  Contenedor con un `ref` único, `useGSAP(() => {...}, { scope: containerRef })` con deps vacías — como `Reveal` se monta de cero cada vez que `Play` cambia de la rama "playing" a la rama "reveal" (tipos de componente distintos en la misma posición JSX ⇒ remount natural de React), el timeline corre exactamente una vez por ronda sin necesidad de key manual.

### Archivos modificados
- **`lib/engine.ts`** — nueva función pura exportada:
  ```ts
  export function scoreBreakdown(round: Round): { base: number; penalty: number; total: number } {
    const best = bestGuess(round);
    const base = best ? ringPoints(best.ring) : 0;
    const penalty = round.hints.length * HINT_PENALTY + Math.max(0, round.guesses.length - 1) * EXTRA_GUESS_PENALTY;
    return { base, penalty, total: Math.max(0, base - penalty) };
  }
  ```
  `scoreRound` pasa a reutilizarla (`scoreBreakdown(round).total`) — cero cambio de comportamiento, solo expone los números que ya se calculaban internamente.
- **`components/game/Swatch.tsx`** — añade `data-row`, `data-col`, y `data-target` (solo presente cuando `isTarget`) al `<button>`. Sin cambio visual; son los únicos hooks que `Reveal` necesita para seleccionar/medir swatches sin prop-drilling de refs.
- **`components/screens/Play.tsx`** — la rama `!isPlaying` se reemplaza por `<Reveal .../>` con los props construidos desde `round`/`state`. La rama `isPlaying` no cambia.
- **`package.json`** — añade `gsap` y `@gsap/react`.
- **`app/globals.css`** — bloque `@media (prefers-reduced-motion: reduce)` que anula transiciones CSS existentes (el `active:scale-95` de `Swatch`, el `transition-[width]` de `Thermometer`), cumpliendo "tras `prefers-reduced-motion`, en CSS y en JS" de §8.3.

## Estrategia reduced-motion

El JSX por defecto **ya renderiza el estado final en reposo**: swatches no-objetivo con opacity 0.35 vía clase condicional, línea con `scaleX(1)` por defecto, foto a color por defecto, panel de acciones visible por defecto. Esto es lo que ve cualquier usuario sin JS o con `prefers-reduced-motion`, satisfaciendo "sin pérdida de información" sin ramas de render separadas.

Cuando `!prefersReducedMotion()`, `useGSAP` hace `gsap.set()` a los valores iniciales ocultos (dim de más, línea en `scaleX(0)`, foto color en `opacity:0`, panel desplazado+transparente) y luego anima hacia el estado que ya está en el DOM. Patrón estándar GSAP ("animar desde"): el reposo correcto siempre es el resultado final, con o sin animación.

## Timeline (dentro de `useGSAP`, un solo `gsap.timeline()`)

| t | Evento | Propiedad animada |
|---|---|---|
| 0.0s | Swatches no-objetivo → opacity 0.35 | `opacity` |
| 0.2s | Swatch objetivo: pulso de escala 1→1.06→1 | `transform` (scale) |
| 0.5s | Línea punteada objetivo↔mejor-tiro | `transform` (scaleX) |
| 0.8s | Pista: cross-fade color sobre B/N (900ms) / si es palabra, swatch real crece junto al texto | `opacity` / `transform` (scale) |
| 1.1s | Score cuenta hacia arriba (tween de un objeto plano, `ease: "power2.out"` = cúbico) + `.call()` dispara háptico | texto vía `onUpdate`, no CSS |
| 1.4s | Panel de acciones entra desde abajo | `transform` (translateY) + `opacity` |

**Línea:** si `best.row === grid.target.row && best.col === grid.target.col` (o `best === null`), no se renderiza línea — un tiro exacto no necesita apuntador. Geometría: `getBoundingClientRect()` sobre los dos `[data-row][data-col]` dentro del contenedor de `Reveal`, medido dentro del propio `useGSAP` antes de construir el timeline (no un `useEffect` aparte).

**Score breakdown:** se muestra "`base − penalty`" (ej. "100 − 15") solo si `penalty > 0`; si no, solo el número final. Jerarquía visual (§7.2): veredicto (sans) → puntuación (mono grande) → auditoría (mono pequeño).

**Háptico:** `"vibrate" in navigator` feature-detected; patrón corto (`[40]`) si el veredicto no es "Clavado."/"A un matiz." (fallo real según SPRINTS: "corto al fallar"), patrón triple (`[30,60,30,60,30]`) si acertó. iOS Safari no soporta `vibrate` — no-op silencioso, ya cubierto por el feature-detect.

## Testing

Sigue el patrón ya establecido en Sprint 1-2: cero tests de componente. `scoreBreakdown` en `lib/engine.ts` sí es testeable puro — se añade a `lib/engine.test.ts`. La coreografía visual se verifica con un walkthrough en navegador real (Playwright), como Sprint 1 y 2, cubriendo: secuencia completa con motion, estado final idéntico con `prefers-reduced-motion` forzado (emulación de Playwright), caso "Clavado" sin línea, clue de palabra vs imagen.
