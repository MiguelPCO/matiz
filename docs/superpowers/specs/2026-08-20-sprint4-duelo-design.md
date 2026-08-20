# Sprint 4 — Duelo hotseat, diseño

## Contexto

Sprints 0-3 están hechos: bucle solo completo (setup → grid → tiros → reveal con
coreografía GSAP), pantallas S0/S1/S3/S4/S6 construidas, `git` local
inicializado. Este sprint construye el modo Duelo hotseat: dos personas, un
móvil, sin filtraciones (PRD objetivo O2).

**Ya construido, ahora confirmado, no se toca en este sprint:**

- `lib/engine.ts` ya tiene el reducer de duelo completo: `START_DUEL`,
  `UNLOCK_CURTAIN`, `NEXT` (traspaso de dos rondas), `REMATCH` (invierte
  quién empieza, conserva jugadores/config). Se construyó por adelantado en
  Sprint 1.
- `winner()` (desempate puntos → pistas → tiros → ΔE) ya existe.
- `Reveal.tsx` se construyó **pure-props** en Sprint 3 específicamente para
  este sprint — se reutiliza sin cambios.

**Decisión confirmada con Miguel esta sesión:** el traspaso de turno tras la
ronda 1 va `reveal ──NEXT──▶ setup` directo (el jugador que acaba de
adivinar, con el móvil ya en mano, pasa a definir la pista de la ronda 2) —
sin cortina intermedia. La cortina solo aparece justo después de
`SUBMIT_CLUE`, antes de que el rival juegue. Esta es la lectura de
SCHEMA §7, no la del diagrama ASCII de PRD §6 (que se lee al revés). Esto
resuelve la nota `SIN CONFIRMAR` que llevaba abierta desde Sprint 1 en
`lib/engine.test.ts`.

## Decisión: dónde se recogen los nombres de los jugadores

SCHEMA: `home ──START_DUEL──▶ setup`, un solo paso, sin pantalla dedicada.
**Decisión confirmada:** los nombres se recogen **inline en Home**. Tocar
«Duelo» expande dos inputs (placeholder J1/J2, sin lo demás) + botón
«Empezar duelo» → `dispatch({type:"START_DUEL", names:[...]})`. Mismo
patrón de disclosure progresivo que Setup ya usa para el gate de
`hasPlayed`. Sin pantalla ni componente overlay nuevo.

## Componentes y pantallas

### `components/ui/HoldToConfirm.tsx` (nuevo)

```ts
interface HoldToConfirmProps {
  readonly durationMs?: number; // default 1200
  readonly label: string;
  readonly onConfirm: () => void;
}
```

- Pointer Events (unifica touch/mouse). `onPointerDown` arranca un tween
  GSAP que rota un wrapper `transform: rotate(0→360deg)` en `durationMs`.
  El anillo de progreso se construye con la técnica clásica de dos
  semicírculos (`clip-path: inset()` fijo como máscara + una capa de
  relleno que rota) — **solo `transform`**, nunca `stroke-dashoffset`
  (SCHEMA §8.3).
- `onPointerUp` / `onPointerLeave` / `onPointerCancel` antes de completar:
  mata el tween, vuelve a 0.
- Al completar: llama `onConfirm`.
- Fallback de teclado: `keydown`/`keyup` de `Enter`/`Space` disparan el
  mismo arranque/cancelación.
- **No se gatea por `prefers-reduced-motion`** — es feedback funcional de
  un gesto de confirmación cronometrado, no decoración; debe seguir
  tardando lo mismo con o sin motion (la razón anti-toque-accidental de la
  Cortina no desaparece).

### `components/screens/Curtain.tsx` (nuevo, S2)

Lee `useGame()` directamente (pantalla, no pure-props — a diferencia de
`Reveal`, no tiene caso de reutilización futura conocido). En fase
`"curtain"`, `state.players[state.activeIndex]` ya es el **adivinador**
que va a jugar a continuación (así lo deja `SUBMIT_CLUE` en su rama de
duelo).

- `bg-surface-0` a pantalla completa, negro seco, sin animación de
  entrada.
- Nombre del jugador en tipografía grande, coloreado por `accent`
  (`'signal'` → ámbar, `'muted'` → token neutro) — nunca un color de la
  paleta de cartas (PRD §7.3).
- `HoldToConfirm` centrado, `label="Mantén pulsado"`,
  `onConfirm={() => dispatch({type:"UNLOCK_CURTAIN"})}`.
- **Sin control de retroceso** — deliberado, coherente con «corte seco,
  sin fricción extra, sin contenido de juego».

### `lib/engine.ts` — nueva función pura `winnerBreakdown`

```ts
export function winnerBreakdown(
  state: GameState,
): { winnerId: PlayerId | null; stage: "score" | "hints" | "guesses" | "closeness" | "tie" }
```

Misma cascada de desempate que `winner()` (puntos → pistas → tiros →
closeness del mejor tiro), pero además devuelve **en qué etapa** se
decidió, o `"tie"` para empate total. El texto en español vive en la UI
(`Scoreboard.tsx` mapea `stage` → copy), igual que `verdictFor()` ya vive
en `Play.tsx` y no en `engine.ts` — el motor devuelve datos, la pantalla
pone las palabras.

### `components/screens/Scoreboard.tsx` (nuevo, S5)

Lee `useGame()` directamente. Dos tarjetas de jugador (nombre en su color
de acento, puntuación, pistas usadas, tiros), ganador resaltado o estado
«Empate», una línea explicando el desempate vía `winnerBreakdown` + mapa
de copy local. Botones: «Revancha» → `dispatch({type:"REMATCH"})»,
«Inicio» → `dispatch({type:"GO_HOME"})` — ambos ya correctamente
implementados en el reducer.

### `components/screens/Home.tsx` (modificado)

Botón «Duelo» deja de estar deshabilitado. Estado local
`useState<"idle" | "names">`. Al tocar Duelo: revela dos inputs (`Label` +
texto, placeholder J1/J2) + `Button` primario «Empezar duelo» →
`dispatch({type:"START_DUEL", names:[nombreA, nombreB]})` (trim/defaults
ya los resuelve `makePlayer` en el reducer). Mostrar el formulario de
nombres oculta los tres botones de modo, igual que Setup oculta el picker
completo en la primera partida.

### `components/screens/Setup.tsx` (modificado, solo copy)

Sin nuevo estado. Cuando `state.mode === "duel"`, el `Label` «Pista» pasa
a «Pista para {rival}» — `rival = state.players[1 - state.activeIndex]`.
El swatch de previsualización se sigue mostrando al que define la pista
(el secreto es cosa de la Cortina, no de Setup — mismo precedente que
Sprint 3). Lógica de error/fallback de palabra/imagen intacta.

### `components/screens/Play.tsx` (modificado, mínimo)

Solo cambia el `actionLabel` que se pasa a `Reveal`:

```ts
const actionLabel =
  state.mode === "solo"
    ? "Otra ronda"
    : state.rounds.length >= 2
      ? "Ver marcador"
      : "Continuar";
```

`onAction` sigue siendo `() => dispatch({type:"NEXT"})` sin cambios —
`NEXT` ya enruta correctamente a `setup` (ronda 2) o `scoreboard` (duelo
completo). **`Reveal.tsx` no cambia en absoluto** — confirma la apuesta
pure-props de Sprint 3.

### `app/page.tsx` (modificado)

Añade `case "curtain": return <Curtain />;` y
`case "scoreboard": return <Scoreboard />;`. Actualiza el comentario del
`default` (ya no menciona curtain/scoreboard como "Sprint 4 sin
construir").

## Testing

Misma convención que Sprints 1-3: sin tests de componente (SCHEMA §11
solo exige `lib/`). `lib/engine.test.ts` gana casos unitarios para
`winnerBreakdown` (score / hints / guesses / closeness / tie — 5 casos).
El duelo completo se verifica con un recorrido Playwright real (un solo
navegador simulando el paso de móvil): Home→Duelo→nombres→Setup(J1 define
para J2)→Curtain «Turno de J2»→mantener pulsado→Play(J2)→Reveal→
Continuar→Setup(J2 define para J1)→Curtain «Turno de J1»→mantener
pulsado→Play(J1)→Reveal→«Ver marcador»→Scoreboard (ganador + motivo)→
Revancha→Setup (jugadores conservados, empieza el otro). También se
elimina el comentario `SIN CONFIRMAR` ya resuelto en `engine.test.ts`.

## Fuera de alcance de este sprint

- Accesibilidad más allá de lo ya establecido (foco visible, aria-labels
  extra) — Sprint 5.
- Verificación contra la API real de Anthropic — sigue sin clave en este
  entorno, no bloquea (modo imagen siempre disponible como fallback).
- El bug conocido de pop-out del target en `lib/grid.ts` — sigue diferido,
  no se reabre sin un plan real de eje L.
