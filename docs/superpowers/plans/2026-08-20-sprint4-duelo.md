# Sprint 4 — Duelo hotseat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Duelo hotseat mode end-to-end — name entry, per-turn Cortina handoff, duel-aware Setup copy, Marcador with explained tiebreak — reusing the Sprint 3 reducer and `Reveal.tsx` unchanged.

**Architecture:** The reducer (`lib/engine.ts`) already implements the full duel state machine (`START_DUEL`, `UNLOCK_CURTAIN`, `NEXT`, `REMATCH`, `winner`) from Sprint 1 — this plan is almost entirely UI. Two new screens (`Curtain`, `Scoreboard`) plug into `app/page.tsx`'s existing `switch(state.phase)` router. One new primitive (`HoldToConfirm`) is a hold-and-release gesture with a 12-tick circular progress indicator, built with SVG `<line>` elements whose only animated property is `opacity` (transform/opacity/clip-path-only rule, SCHEMA §8.3 — no `stroke-dashoffset`). `Home.tsx` and `Setup.tsx` get small, additive changes; `Reveal.tsx` and the reducer are untouched.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, GSAP + `@gsap/react` (already dependencies), Vitest, Playwright MCP for browser verification.

**Spec:** `docs/superpowers/specs/2026-08-20-sprint4-duelo-design.md`

## Global Constraints

- Animation: only `transform`, `opacity`, `clip-path` may be animated — never `filter`, never `stroke-dashoffset` (SCHEMA §8.3, non-negotiable).
- Reducer purity: `lib/engine.ts` never does I/O and never generates unseeded randomness. `winnerBreakdown` must be a pure function of `GameState`.
- Player identity colors come from the neutral ramp + amber only, never from the card palette (PRD §7.3): `accent: "signal"` → `text-signal` (amber), `accent: "muted"` → `text-text` (bright neutral).
- All UI copy is Spanish, matching the existing micro-label style: `font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint` (the `Label` component already wraps this).
- No component-level tests this sprint (SCHEMA §11's testing mandate is `lib/`-level only) — new screens/components are verified via a live Playwright walkthrough, matching the Sprint 1-3 convention.
- Confirmed this session: the duel turn handoff after round 1 goes `reveal ──NEXT──▶ setup` directly (same player, still holding the phone, becomes the next setter) — no cortina in between. Cortina only appears right after `SUBMIT_CLUE`, before the guesser plays. This is already implemented and passing in `lib/engine.ts`/`lib/engine.test.ts`.
- Duel player names are collected inline on Home (no dedicated screen) — tap "Duelo" expands two inputs + "Empezar duelo".

---

### Task 1: `winnerBreakdown` in the engine + confirm the turn-handoff note

**Files:**
- Modify: `lib/engine.ts:61-80` (replace the existing `winner()` function)
- Modify: `lib/engine.test.ts:1-4` (import list), `lib/engine.test.ts:169-174` (SIN CONFIRMAR comment), and append a new `describe` block at the end of the file

**Interfaces:**
- Consumes: `GameState`, `PlayerId`, `Round` from `./types`; `bestGuess` (already in `lib/engine.ts`)
- Produces: `winnerBreakdown(state: GameState): { winnerId: PlayerId | null; stage: "score" | "hints" | "guesses" | "closeness" | "tie" }` — used by Task 6 (`Scoreboard.tsx`). `winner(state: GameState): PlayerId | null` keeps its existing signature (now delegates to `winnerBreakdown`), still used by `lib/engine.test.ts`'s existing duel test.

- [ ] **Step 1: Write the failing tests**

In `lib/engine.test.ts`, change the import line:

```ts
import { bestGuess, initialState, isRoundOver, reducer, scoreBreakdown, scoreRound, winner, winnerBreakdown } from "./engine";
```

and change the type import line to also pull `Round`:

```ts
import type { GameState, GridSize, Round } from "./types";
```

Append this new `describe` block at the end of the file:

```ts
describe("engine.invariants — winnerBreakdown", () => {
  const p1 = "p1";
  const p2 = "p2";

  function stateWith(rounds: readonly Round[]): GameState {
    return {
      mode: "duel",
      phase: "scoreboard",
      players: [
        { id: p1, name: "Ana", accent: "signal" },
        { id: p2, name: "Beto", accent: "muted" },
      ],
      activeIndex: 0,
      config: { size: 4, difficulty: "facil" },
      rounds,
      currentRound: null,
      hasPlayed: true,
    };
  }

  function round(overrides: Partial<Round> & { guesserId: string }): Round {
    return {
      id: "r",
      setterId: null,
      clue: { type: "word", word: "x", targetHex: "#000000" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#000000" },
      guesses: [],
      hints: [],
      status: "solved",
      score: 0,
      ...overrides,
    };
  }

  it("decide por puntuación cuando difieren", () => {
    const s = stateWith([
      round({ guesserId: p1, score: 100 }),
      round({ guesserId: p2, score: 60 }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p1, stage: "score" });
  });

  it("empate en puntos, decide por menos pistas", () => {
    const s = stateWith([
      round({ guesserId: p1, score: 60, hints: [{ kind: "light", text: "" }] }),
      round({ guesserId: p2, score: 60, hints: [] }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p2, stage: "hints" });
  });

  it("empate en puntos y pistas, decide por menos tiros", () => {
    const s = stateWith([
      round({
        guesserId: p1,
        score: 60,
        guesses: [
          { row: 0, col: 0, hex: "#000", ring: 2, closeness: 0.3 },
          { row: 0, col: 1, hex: "#000", ring: 0, closeness: 1 },
        ],
      }),
      round({
        guesserId: p2,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 0, closeness: 1 }],
      }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p2, stage: "guesses" });
  });

  it("empate en puntos/pistas/tiros, decide por closeness del mejor tiro", () => {
    const s = stateWith([
      round({
        guesserId: p1,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 1, closeness: 0.7 }],
      }),
      round({
        guesserId: p2,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 1, closeness: 0.9 }],
      }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p2, stage: "closeness" });
  });

  it("empate total en las cuatro etapas → tie, sin ganador", () => {
    const s = stateWith([
      round({
        guesserId: p1,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 1, closeness: 0.7 }],
      }),
      round({
        guesserId: p2,
        score: 60,
        guesses: [{ row: 1, col: 1, hex: "#111", ring: 1, closeness: 0.7 }],
      }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: null, stage: "tie" });
  });
});
```

Also replace the now-resolved comment block at `lib/engine.test.ts:169-174` (inside the duel test, right before the mid-match `NEXT` call):

```ts
    // NEXT tras ronda 1: Beto (quien acaba de adivinar) pasa a poner la
    // pista de la ronda 2 — Ana adivinará. Aún no hay marcador.
    // NOTA: esta lectura del traspaso de turno (PRD §4.8 / SCHEMA §7) está
    // SIN CONFIRMAR por Miguel — el diagrama ASCII de PRD §6 parece leerse al
    // revés (ver project_matiz.md en memoria). No construir sobre esto en
    // Sprint 4 sin confirmarlo primero.
```

with:

```ts
    // NEXT tras ronda 1: Beto (quien acaba de adivinar) pasa a poner la
    // pista de la ronda 2 — Ana adivinará. Aún no hay marcador. Confirmado
    // por Miguel en Sprint 4: sin cortina intermedia — el mismo jugador
    // sigue con el móvil y pasa directo a definir la pista del rival.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/engine.test.ts`
Expected: FAIL — `winnerBreakdown` is not exported from `./engine`.

- [ ] **Step 3: Implement `winnerBreakdown`, refactor `winner` to delegate**

In `lib/engine.ts`, replace the existing block (currently lines 61-80):

```ts
/** Desempate del duelo: puntos → pistas → tiros → ΔE del mejor tiro. */
export function winner(state: GameState): PlayerId | null {
  if (state.mode !== "duel" || state.rounds.length < 2) return null;
  const r1 = state.rounds[0];
  const r2 = state.rounds[1];
  if (!r1 || !r2 || r1.score === null || r2.score === null) return null;

  if (r1.score !== r2.score) return r1.score > r2.score ? r1.guesserId : r2.guesserId;
  if (r1.hints.length !== r2.hints.length) {
    return r1.hints.length < r2.hints.length ? r1.guesserId : r2.guesserId;
  }
  if (r1.guesses.length !== r2.guesses.length) {
    return r1.guesses.length < r2.guesses.length ? r1.guesserId : r2.guesserId;
  }

  const c1 = bestGuess(r1)?.closeness ?? -1;
  const c2 = bestGuess(r2)?.closeness ?? -1;
  if (c1 !== c2) return c1 > c2 ? r1.guesserId : r2.guesserId;
  return null;
}
```

with:

```ts
export type WinnerStage = "score" | "hints" | "guesses" | "closeness" | "tie";

/**
 * Desempate del duelo: puntos → pistas → tiros → ΔE del mejor tiro. Devuelve
 * también en qué etapa se decidió — el texto en español vive en la UI
 * (Scoreboard.tsx), no aquí; el motor solo devuelve datos.
 */
export function winnerBreakdown(state: GameState): { winnerId: PlayerId | null; stage: WinnerStage } {
  if (state.mode !== "duel" || state.rounds.length < 2) return { winnerId: null, stage: "tie" };
  const r1 = state.rounds[0];
  const r2 = state.rounds[1];
  if (!r1 || !r2 || r1.score === null || r2.score === null) return { winnerId: null, stage: "tie" };

  if (r1.score !== r2.score) {
    return { winnerId: r1.score > r2.score ? r1.guesserId : r2.guesserId, stage: "score" };
  }
  if (r1.hints.length !== r2.hints.length) {
    return {
      winnerId: r1.hints.length < r2.hints.length ? r1.guesserId : r2.guesserId,
      stage: "hints",
    };
  }
  if (r1.guesses.length !== r2.guesses.length) {
    return {
      winnerId: r1.guesses.length < r2.guesses.length ? r1.guesserId : r2.guesserId,
      stage: "guesses",
    };
  }

  const c1 = bestGuess(r1)?.closeness ?? -1;
  const c2 = bestGuess(r2)?.closeness ?? -1;
  if (c1 !== c2) return { winnerId: c1 > c2 ? r1.guesserId : r2.guesserId, stage: "closeness" };
  return { winnerId: null, stage: "tie" };
}

export function winner(state: GameState): PlayerId | null {
  return winnerBreakdown(state).winnerId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/engine.test.ts`
Expected: PASS — all tests including the 5 new `winnerBreakdown` cases and the still-passing existing duel test.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/engine.ts lib/engine.test.ts
git commit -m "feat: add winnerBreakdown, confirm duel turn-handoff reading"
```

---

### Task 2: `HoldToConfirm` UI primitive

**Files:**
- Create: `components/ui/HoldToConfirm.tsx`

**Interfaces:**
- Consumes: `gsap` (already a dependency, same import style as `components/game/Reveal.tsx`: `import gsap from "gsap";`)
- Produces: `HoldToConfirm({durationMs?, label, onConfirm}: {durationMs?: number; label: string; onConfirm: () => void})` — a default-exported-free named export, consumed by Task 3 (`Curtain.tsx`).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useRef } from "react";
import gsap from "gsap";

interface HoldToConfirmProps {
  readonly durationMs?: number;
  readonly label: string;
  readonly onConfirm: () => void;
}

const DEFAULT_DURATION_MS = 1200;
const TICK_COUNT = 12;

/**
 * Anillo de progreso hecho de 12 marcas SVG que se iluminan en secuencia
 * (opacity 0.25→1, GSAP stagger) mientras se mantiene pulsado — nunca
 * stroke-dashoffset (SCHEMA §8.3). No se gatea por prefers-reduced-motion:
 * es feedback funcional de un gesto cronometrado, no decoración.
 */
function tickLine(i: number) {
  const angle = (i * 360) / TICK_COUNT - 90; // 0 → 12 en punto, avanza en sentido horario
  const rad = (angle * Math.PI) / 180;
  const innerR = 34;
  const outerR = 46;
  return {
    x1: 50 + innerR * Math.cos(rad),
    y1: 50 + innerR * Math.sin(rad),
    x2: 50 + outerR * Math.cos(rad),
    y2: 50 + outerR * Math.sin(rad),
  };
}

export function HoldToConfirm({
  durationMs = DEFAULT_DURATION_MS,
  label,
  onConfirm,
}: HoldToConfirmProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  function start() {
    if (tweenRef.current) return;
    const ticks = svgRef.current?.querySelectorAll<SVGLineElement>("[data-tick]");
    if (!ticks || ticks.length === 0) return;
    tweenRef.current = gsap.to(ticks, {
      opacity: 1,
      duration: durationMs / 1000,
      ease: "none",
      stagger: durationMs / 1000 / TICK_COUNT,
      onComplete: () => {
        tweenRef.current = null;
        onConfirm();
      },
    });
  }

  function cancel() {
    if (!tweenRef.current) return;
    tweenRef.current.kill();
    tweenRef.current = null;
    const ticks = svgRef.current?.querySelectorAll<SVGLineElement>("[data-tick]");
    if (ticks) gsap.set(ticks, { opacity: 0.25 });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") cancel();
      }}
      className="relative flex h-28 w-28 select-none flex-col items-center justify-center gap-1 rounded-full outline-none"
    >
      <svg ref={svgRef} viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const { x1, y1, x2, y2 } = tickLine(i);
          return (
            <line
              key={i}
              data-tick
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-signal opacity-25"
            />
          );
        })}
      </svg>
      <span className="relative px-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {label}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/HoldToConfirm.tsx
git commit -m "feat: add HoldToConfirm hold-and-release primitive"
```

*(Visual/interaction correctness — hold-to-complete, release-to-cancel, keyboard fallback — is verified live in Task 8's Playwright walkthrough, matching the project's no-component-test convention.)*

---

### Task 3: `Curtain.tsx` (S2)

**Files:**
- Create: `components/screens/Curtain.tsx`

**Interfaces:**
- Consumes: `useGame()` from `../../hooks/useGame` (returns `{state, dispatch}`); `HoldToConfirm` from `../ui/HoldToConfirm` (Task 2); `state.players[state.activeIndex]` is the guesser about to play (already guaranteed by `SUBMIT_CLUE`'s duel branch in `lib/engine.ts`)
- Produces: `Curtain()` component, consumed by Task 7 (`app/page.tsx` routing)

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useGame } from "../../hooks/useGame";
import { HoldToConfirm } from "../ui/HoldToConfirm";

/**
 * S2 — corte a negro seco entre turnos (PRD §7.3). state.activeIndex ya
 * apunta al adivinador que va a jugar a continuación (lo deja así
 * SUBMIT_CLUE en su rama de duelo) — no hay cálculo que hacer aquí.
 */

const ACCENT_CLASS: Record<"signal" | "muted", string> = {
  signal: "text-signal",
  muted: "text-text",
};

export function Curtain() {
  const { state, dispatch } = useGame();
  const player = state.players[state.activeIndex];
  if (!player) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-surface-0 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Turno de
        </span>
        <h1
          className={`font-sans text-3xl uppercase tracking-[0.15em] ${ACCENT_CLASS[player.accent]}`}
        >
          {player.name}
        </h1>
      </div>
      <HoldToConfirm label="Mantén pulsado" onConfirm={() => dispatch({ type: "UNLOCK_CURTAIN" })} />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Curtain.tsx
git commit -m "feat: add Curtain screen (S2)"
```

---

### Task 4: Home.tsx — duel entry (name collection)

**Files:**
- Modify: `components/screens/Home.tsx` (replace entire file)

**Interfaces:**
- Consumes: `useGame()`, existing `Button`/`Label` components, `GameAction` type `{type:"START_DUEL", names:[string,string]}` (already in `lib/types.ts`)
- Produces: no new exports — same `Home()` component, now with a working "Duelo" path

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { oklchToHex } from "../../lib/color";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { HowToPlay } from "./HowToPlay";

const STRIP_COUNT = 10;

/** Tira decorativa: barrido de L a C/H fijos, mismo tono que el acento ámbar. */
function useCalibrationStrip(): readonly string[] {
  return useMemo(() => {
    const swatches: string[] = [];
    for (let i = 0; i < STRIP_COUNT; i++) {
      const L = 0.25 + (i / (STRIP_COUNT - 1)) * 0.6;
      swatches.push(oklchToHex({ L, C: 0.1, H: 68 }));
    }
    return swatches;
  }, []);
}

export function Home() {
  const { state, dispatch } = useGame();
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [collectingNames, setCollectingNames] = useState(false);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const strip = useCalibrationStrip();

  function handleStartDuel() {
    dispatch({ type: "START_DUEL", names: [nameA, nameB] });
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-10 px-4">
      <button
        type="button"
        onClick={() => setHowToPlayOpen(true)}
        aria-label="Cómo se juega"
        className="absolute top-6 right-6 font-mono text-xs text-text-faint"
      >
        ?
      </button>

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-sans text-3xl tracking-[0.35em] text-text uppercase">
          MAT<span className="text-signal">I</span>Z
        </h1>
        <p className="font-sans text-sm text-text-muted">Lee el color a ciegas.</p>
      </div>

      <div className="flex w-full gap-1">
        {strip.map((hex, i) => (
          <div key={i} className="h-2 flex-1 rounded-full" style={{ backgroundColor: hex }} aria-hidden="true" />
        ))}
      </div>

      {collectingNames ? (
        <div className="flex w-full flex-col gap-3">
          <div>
            <Label className="mb-1.5 block">Jugador 1</Label>
            <input
              value={nameA}
              onChange={(e) => setNameA(e.target.value)}
              placeholder="J1"
              className="w-full rounded-[var(--radius-panel)] border border-line bg-surface-1 px-3 py-2 font-sans text-sm text-text"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Jugador 2</Label>
            <input
              value={nameB}
              onChange={(e) => setNameB(e.target.value)}
              placeholder="J2"
              className="w-full rounded-[var(--radius-panel)] border border-line bg-surface-1 px-3 py-2 font-sans text-sm text-text"
            />
          </div>
          <Button variant="primary" onClick={handleStartDuel}>
            Empezar duelo
          </Button>
          <Button variant="ghost" onClick={() => setCollectingNames(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <Button variant="primary" onClick={() => dispatch({ type: "START_SOLO", config: state.config })}>
            Solo
          </Button>
          <Button variant="secondary" onClick={() => setCollectingNames(true)}>
            Duelo
          </Button>
          <Button variant="secondary" disabled aria-disabled="true">
            Diario · Próximamente
          </Button>
        </div>
      )}

      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Home.tsx
git commit -m "feat: unlock Duelo on Home with inline name entry"
```

---

### Task 5: Setup.tsx — duel-mode "pista para {rival}" copy

**Files:**
- Modify: `components/screens/Setup.tsx:59-67` (add `rival`/`pistaLabel`), `components/screens/Setup.tsx:178` and `:196` (the two `<Label>Pista</Label>` occurrences)

**Interfaces:**
- Consumes: `state.mode`, `state.players`, `state.activeIndex` from `useGame()` (already destructured in the file)
- Produces: no new exports — same `Setup()` component, copy-only change

- [ ] **Step 1: Add the rival lookup**

In `components/screens/Setup.tsx`, right after the existing line (currently line 67):

```ts
  const showPicker = state.hasPlayed;
```

add:

```ts

  const rival = state.mode === "duel" ? state.players[1 - state.activeIndex] : null;
  const pistaLabel = rival ? `Pista para ${rival.name}` : "Pista";
```

- [ ] **Step 2: Use it in both clue-type branches**

Replace the word-branch label (currently line 178):

```tsx
          <Label className="block">Pista</Label>
```

with:

```tsx
          <Label className="block">{pistaLabel}</Label>
```

Replace the image-branch label (currently line 196) the same way:

```tsx
          <Label className="block">Pista</Label>
```

with:

```tsx
          <Label className="block">{pistaLabel}</Label>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/screens/Setup.tsx
git commit -m "feat: show rival name in Setup's clue label during duelo"
```

---

### Task 6: `Scoreboard.tsx` (S5)

**Files:**
- Create: `components/screens/Scoreboard.tsx`

**Interfaces:**
- Consumes: `winnerBreakdown` from `../../lib/engine` (Task 1); `useGame()`; `Button`, `Label` components
- Produces: `Scoreboard()` component, consumed by Task 7 (`app/page.tsx` routing)

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { winnerBreakdown, type WinnerStage } from "../../lib/engine";
import { useGame } from "../../hooks/useGame";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";

/** S5 — comparativa final del duelo (PRD §6). El motor solo da datos (winnerBreakdown); el texto vive aquí. */

const STAGE_COPY: Record<WinnerStage, string> = {
  score: "por puntuación",
  hints: "usó menos pistas",
  guesses: "acertó en menos tiros",
  closeness: "por precisión en el mejor tiro",
  tie: "",
};

export function Scoreboard() {
  const { state, dispatch } = useGame();
  const { winnerId, stage } = winnerBreakdown(state);
  const round1 = state.rounds[0];
  const round2 = state.rounds[1];

  if (!round1 || !round2) return null;

  const rows = state.players.map((player) => {
    const round = player.id === round1.guesserId ? round1 : round2;
    return {
      player,
      score: round.score ?? 0,
      hints: round.hints.length,
      guesses: round.guesses.length,
    };
  });

  const winnerName = state.players.find((p) => p.id === winnerId)?.name;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-4">
      <Label>Marcador</Label>

      <div className="flex w-full flex-col gap-3">
        {rows.map(({ player, score, hints, guesses }) => (
          <div
            key={player.id}
            className={`flex items-center justify-between rounded-[var(--radius-panel)] bg-surface-1 p-4 ${
              player.id === winnerId ? "ring-2 ring-signal" : ""
            }`}
          >
            <div>
              <p className={`font-sans text-lg ${player.accent === "signal" ? "text-signal" : "text-text"}`}>
                {player.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
                {hints} pista{hints === 1 ? "" : "s"} · {guesses} tiro{guesses === 1 ? "" : "s"}
              </p>
            </div>
            <p className="font-mono text-2xl font-bold text-text">{score}</p>
          </div>
        ))}
      </div>

      <p className="text-center font-sans text-sm text-text-muted">
        {winnerId && winnerName ? `Gana ${winnerName} — ${STAGE_COPY[stage]}` : "Empate perfecto."}
      </p>

      <div className="flex w-full flex-col gap-3">
        <Button variant="primary" onClick={() => dispatch({ type: "REMATCH" })}>
          Revancha
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "GO_HOME" })}>
          Inicio
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Scoreboard.tsx
git commit -m "feat: add Scoreboard screen (S5) with explained tiebreak"
```

---

### Task 7: Wire it all together — Play.tsx action label, page.tsx routing

**Files:**
- Modify: `components/screens/Play.tsx:107-118` (the `<Reveal>` call)
- Modify: `app/page.tsx` (imports + `switch` cases)

**Interfaces:**
- Consumes: `Curtain` (Task 3), `Scoreboard` (Task 6) as default UI-tree consumers of `app/page.tsx`'s router
- Produces: nothing new — this is pure wiring, no new exports

- [ ] **Step 1: Make Play.tsx's action label duel-aware**

In `components/screens/Play.tsx`, replace the existing `<Reveal>` call (currently lines 107-118):

```tsx
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel="Otra ronda"
          onAction={() => dispatch({ type: "NEXT" })}
        />
```

with:

```tsx
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel={
            state.mode === "solo" ? "Otra ronda" : state.rounds.length >= 2 ? "Ver marcador" : "Continuar"
          }
          onAction={() => dispatch({ type: "NEXT" })}
        />
```

- [ ] **Step 2: Route the two new phases in page.tsx**

Replace the entire contents of `app/page.tsx` with:

```tsx
"use client";

import { Curtain } from "../components/screens/Curtain";
import { Home } from "../components/screens/Home";
import { Play } from "../components/screens/Play";
import { Scoreboard } from "../components/screens/Scoreboard";
import { Setup } from "../components/screens/Setup";
import { useGame } from "../hooks/useGame";

export default function Page() {
  const { state, dispatch } = useGame();

  switch (state.phase) {
    case "home":
      return <Home />;
    case "setup":
      return <Setup />;
    case "curtain":
      return <Curtain />;
    case "playing":
    case "reveal":
      return <Play />;
    case "scoreboard":
      return <Scoreboard />;
    default:
      // Salvaguarda para cualquier fase futura sin pantalla construida —
      // no debería alcanzarse con las seis fases de SCHEMA §6 ya cubiertas.
      return (
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
            Pantalla no disponible todavía
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: "GO_HOME" })}
            className="rounded-[var(--radius-panel)] bg-signal px-4 py-2 font-sans text-sm text-signal-ink"
          >
            Volver al inicio
          </button>
        </main>
      );
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Full automated suite**

Run: `pnpm test && pnpm lint`
Expected: all tests pass (33/33 — 28 existing + 5 new `winnerBreakdown` cases), lint clean.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Play.tsx app/page.tsx
git commit -m "feat: wire Curtain/Scoreboard routing and duel-aware Reveal action label"
```

---

### Task 8: Full duelo Playwright walkthrough (verification, fixes as needed)

**Files:**
- Modify: any file touched above, only if the walkthrough finds a real bug (document the fix in the task report, matching Sprint 3's Task 7 precedent)

**Interfaces:**
- Consumes: the full app via `pnpm dev` + `mcp__plugin_playwright_playwright__*` tools (Chrome extension may not be connected — this is the confirmed working fallback from Sprints 1-3)
- Produces: a verified, working Duelo mode; no new code contract

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` (check the actual printed port — it has landed on 3002 before when 3000 was taken)

- [ ] **Step 2: Walk the full duel loop in the browser**

Using Playwright MCP tools, navigate to the dev server and walk through, checking at each arrow that the phase/content is correct:

1. Home → tap "Duelo" → two name inputs appear → fill "Ana" / "Beto" → "Empezar duelo"
2. Setup: label reads "Pista para Beto" (Ana is `activeIndex 0`, sets for Beto) → enter a word or upload an image → "Empezar"
3. Curtain: shows "Turno de Beto" in amber or neutral per `accent` → press-and-hold the `HoldToConfirm` ring for the full duration → advances to Play
4. Play (Beto guessing): tap a few swatches → Reveal shows Beto's result, verdict, score. Action button reads "Continuar" (not "Otra ronda", not "Ver marcador" — round 1 of 2)
5. Tap "Continuar" → Setup again, this time label reads "Pista para Ana" (Beto is now `activeIndex`, sets for Ana) → submit a clue
6. Curtain: shows "Turno de Ana" → hold to confirm → Play (Ana guessing) → guess to a reveal. Action button now reads "Ver marcador" (round 2 of 2)
7. Tap "Ver marcador" → Scoreboard: both players' rows show correct score/pistas/tiros, winner is ring-highlighted (or "Empate perfecto." if genuinely tied), the explanation line names the correct tiebreak stage
8. Tap "Revancha" → Setup, with both player names preserved and the starter inverted (the player who was NOT `activeIndex` at the start of the previous match should be `activeIndex` now)
9. From Scoreboard (before Revancha, in a fresh run) tap "Inicio" → back to Home, players/rounds cleared

Also verify, in isolation:
- `HoldToConfirm`: press and release **before** the hold completes → ring resets to the dim (opacity 0.25) resting state, no `UNLOCK_CURTAIN` fires, still on Curtain
- Keyboard: `Tab` to the `HoldToConfirm` control, hold `Enter` down for the full duration → same effect as a pointer hold

Check console for unexpected errors/warnings at each step (an expected 502 from the missing `ANTHROPIC_API_KEY`, if word-mode is used without a key, is fine — same as every prior sprint).

- [ ] **Step 3: Fix any real bug found, re-verify just that part**

If the walkthrough surfaces a genuine defect (not a deferred Minor), fix it directly in the relevant file from Tasks 1-7, re-run the specific step that failed, and note the fix explicitly (file, root cause, what changed) — same discipline as Sprint 3's three documented bugs.

- [ ] **Step 4: Final full-suite check**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit** (only if Step 3 produced changes; skip if the walkthrough was clean)

```bash
git add -A
git commit -m "fix: address issues found in Sprint 4 duelo walkthrough"
```
