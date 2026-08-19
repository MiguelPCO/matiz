# Sprint 3 — Coreografía del Reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static reveal end-state in `Play.tsx` into the 1.6s GSAP choreography from PRD §7.2 (dim → target pulse → line → clue cross-fade → score count-up + haptic → action panel), with zero information loss under `prefers-reduced-motion`.

**Architecture:** A new pure-props `components/game/Reveal.tsx` owns the whole timeline via `useGSAP`. It replaces the current `!isPlaying` branch in `Play.tsx`. Two PRD/§8.3 conflicts (filter animation, stroke-dashoffset) are resolved by using only `transform`/`opacity`: the photo reveal is two stacked `<img>`s cross-faded via `opacity`, and the line is a rotated `<div>` animated via `scaleX`. The default (no-JS) JSX render is always the final resting state — GSAP only sets a temporary hidden starting state and animates back to what's already in the DOM, so `prefers-reduced-motion` (which skips the timeline entirely) never loses information.

**Tech Stack:** Next.js 15 / React 19 / TypeScript strict / Tailwind v4 / `gsap` + `@gsap/react` (new deps) / Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-sprint3-reveal-design.md`

## Global Constraints

- Animate only `transform`, `opacity` (never `filter`, never `stroke-dashoffset`) — PRD §8.3, non-negotiable.
- All GSAP hooks go through `useGSAP()` from `@gsap/react` — never a bare `useEffect` for GSAP (PRD §8.3).
- Every animated element's default (non-JS) render state must equal its final reveal-end state — `prefers-reduced-motion` support comes from skipping the timeline, not from a separate render branch.
- `lib/engine.ts` stays pure — no React, no window, no I/O (existing project rule, unchanged by this sprint).
- Reveal microcopy exact per PRD §7.2: "Clavado." / "A un matiz." / "Buen ojo." / "Ese matiz engaña." (already implemented in `Play.tsx`'s `verdictFor`, unchanged).
- Score audit line shows `base − penalty` only when `penalty > 0`; otherwise just the final number (spec decision, not asked to Miguel — flag if wrong).

---

### Task 1: Install GSAP and add `lib/gsap.ts`

**Files:**
- Modify: `package.json` (via `pnpm add`)
- Create: `lib/gsap.ts`

**Interfaces:**
- Produces: `prefersReducedMotion(): boolean`, and the side effect of `gsap.registerPlugin(useGSAP)` (import `"../lib/gsap"` — or the hook itself — before any `useGSAP()` call elsewhere).

- [ ] **Step 1: Install dependencies**

Run: `pnpm add gsap @gsap/react`

- [ ] **Step 2: Write `lib/gsap.ts`**

```ts
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors from the new file.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml lib/gsap.ts
git commit -m "feat: add gsap + reduced-motion helper"
```

---

### Task 2: `lib/engine.ts` — `scoreBreakdown`

**Files:**
- Modify: `lib/engine.ts:36-42`
- Test: `lib/engine.test.ts`

**Interfaces:**
- Consumes: existing `bestGuess(round: Round): Guess | null`, existing module-private `ringPoints`, `RING_POINTS`, `HINT_PENALTY`, `EXTRA_GUESS_PENALTY` (all already defined at the top of `lib/engine.ts`, no new imports needed).
- Produces: `scoreBreakdown(round: Round): { base: number; penalty: number; total: number }` — exported. `scoreRound` is refactored to call it internally; its own signature (`scoreRound(round: Round): number`) is unchanged, so no caller elsewhere needs to change.

- [ ] **Step 1: Write the failing test**

Add to `lib/engine.test.ts` (new `describe` block, after the existing ones — check the end of the file for the right spot, follow the existing `import` list at the top and add `scoreBreakdown` to it):

```ts
describe("engine.invariants — scoreBreakdown", () => {
  it("ring 0 sin pistas ni tiros extra: base=100, penalty=0, total=100", () => {
    const round = {
      id: "r1",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [{ row: 0, col: 0, hex: "#4a72c9", ring: 0, closeness: 1 }],
      hints: [],
      status: "solved",
      score: null,
    } as const;
    expect(scoreBreakdown(round)).toEqual({ base: 100, penalty: 0, total: 100 });
  });

  it("ring 0 con 1 pista y 2 tiros extra: base=100, penalty=15+16=31, total=69", () => {
    const round = {
      id: "r2",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [
        { row: 1, col: 1, hex: "#000000", ring: 2, closeness: 0.2 },
        { row: 1, col: 2, hex: "#111111", ring: 1, closeness: 0.5 },
        { row: 0, col: 0, hex: "#4a72c9", ring: 0, closeness: 1 },
      ],
      hints: [{ kind: "light", text: "..." }],
      status: "solved",
      score: null,
    } as const;
    // base = ringPoints(0) = 100; penalty = 1*15 + (3-1)*8 = 15+16 = 31
    expect(scoreBreakdown(round)).toEqual({ base: 100, penalty: 31, total: 69 });
  });

  it("penalty nunca deja total negativo (clamp a 0)", () => {
    const round = {
      id: "r3",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [{ row: 1, col: 1, hex: "#000000", ring: 3, closeness: 0.1 }],
      hints: [
        { kind: "light", text: "..." },
        { kind: "sat", text: "..." },
      ],
      status: "failed",
      score: null,
    } as const;
    // base = ringPoints(3) = 12; penalty = 2*15 + 0 = 30 → total clamped to 0
    expect(scoreBreakdown(round)).toEqual({ base: 12, penalty: 30, total: 0 });
  });

  it("scoreRound sigue devolviendo el mismo total que scoreBreakdown", () => {
    const round = {
      id: "r4",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [{ row: 0, col: 0, hex: "#4a72c9", ring: 0, closeness: 1 }],
      hints: [],
      status: "solved",
      score: null,
    } as const;
    expect(scoreRound(round)).toBe(scoreBreakdown(round).total);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/engine.test.ts`
Expected: FAIL — `scoreBreakdown is not a function` (not exported yet).

- [ ] **Step 3: Implement `scoreBreakdown` in `lib/engine.ts`**

Replace `lib/engine.ts:36-42` (the current `scoreRound` function) with:

```ts
export function scoreBreakdown(round: Round): { base: number; penalty: number; total: number } {
  const best = bestGuess(round);
  const base = best ? ringPoints(best.ring) : 0;
  const penalty =
    round.hints.length * HINT_PENALTY + Math.max(0, round.guesses.length - 1) * EXTRA_GUESS_PENALTY;
  return { base, penalty, total: Math.max(0, base - penalty) };
}

export function scoreRound(round: Round): number {
  return scoreBreakdown(round).total;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/engine.test.ts`
Expected: PASS, all tests including the pre-existing ones (this is a pure refactor of `scoreRound`, behavior unchanged).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/engine.ts lib/engine.test.ts
git commit -m "feat: expose scoreBreakdown for the reveal score audit line"
```

---

### Task 3: `components/game/Swatch.tsx` — GSAP hooks + reduced-motion-safe dim

**Files:**
- Modify: `components/game/Swatch.tsx` (full file, currently 32 lines)

**Interfaces:**
- Consumes: nothing new (same props as today).
- Produces: DOM contract that `Reveal.tsx` (Task 5) depends on: every swatch `<button>` carries `data-row={row}`, `data-col={col}`, and (only when `isTarget`) a bare `data-target` attribute. Non-target swatches render at `opacity: 0.35` by default whenever `disabled` is true (i.e. during reveal) — this is the reduced-motion resting state; `Reveal.tsx`'s timeline briefly overrides it to `1` via `gsap.set()` then animates back down to `0.35`.

- [ ] **Step 1: Rewrite `components/game/Swatch.tsx`**

```tsx
"use client";

import type { Hex } from "../../lib/types";

interface SwatchProps {
  readonly hex: Hex;
  readonly row: number;
  readonly col: number;
  readonly guessed: boolean;
  readonly isTarget: boolean;
  readonly disabled: boolean;
  readonly onTap: (row: number, col: number) => void;
}

export function Swatch({ hex, row, col, guessed, isTarget, disabled, onTap }: SwatchProps) {
  const transitionClass = disabled ? "" : "transition-transform duration-150";

  return (
    <button
      type="button"
      onClick={() => onTap(row, col)}
      disabled={disabled}
      data-row={row}
      data-col={col}
      data-target={isTarget ? "" : undefined}
      aria-label={`Fila ${row + 1}, columna ${col + 1}`}
      className={`aspect-square rounded-[var(--radius-swatch)] ${transitionClass} disabled:cursor-default enabled:active:scale-95 ${
        isTarget ? "ring-2 ring-signal ring-offset-2 ring-offset-surface-2" : ""
      } ${disabled && !isTarget ? "opacity-[0.35]" : ""}`}
      style={{
        backgroundColor: hex,
        boxShadow: !isTarget && guessed ? "inset 0 0 0 2px var(--color-text-faint)" : undefined,
      }}
    />
  );
}
```

Note: `transition-transform` is dropped while `disabled` (i.e. during reveal) specifically so it doesn't fight the GSAP scale-pulse tween on the target swatch — a CSS transition and a per-frame GSAP tween on the same `transform` property produce a laggy trailing effect otherwise.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS. (No test file for this component — matches the project's established convention of verifying `components/game/*` visually via Playwright, not unit tests; see Sprint 2 plan Task 9.)

- [ ] **Step 3: Commit**

```bash
git add components/game/Swatch.tsx
git commit -m "feat: add GSAP data hooks and reduced-motion dim to Swatch"
```

---

### Task 4: `app/globals.css` — kill CSS transitions under reduced motion

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: nothing consumed by other tasks — this is a standalone global CSS guard, independent of the GSAP timeline (which already checks `prefersReducedMotion()` in JS and never runs). It covers the CSS-only transitions that exist outside the GSAP timeline: `Swatch`'s `active:scale-95` press feedback and `Thermometer`'s `transition-[width]` bar fill.

- [ ] **Step 1: Append the reduced-motion block**

```css
@import "tailwindcss";
@import "../tokens/theme.css";

body {
  background: var(--color-surface-0);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: kill CSS transitions under prefers-reduced-motion"
```

---

### Task 5: `components/game/Reveal.tsx` — the choreography

**Files:**
- Create: `components/game/Reveal.tsx`

**Interfaces:**
- Consumes:
  - `ColorCard` from `./ColorCard` — `{grid: Grid, guesses: readonly Guess[], disabled: boolean, revealTarget: boolean, onTap: (row:number,col:number)=>void}` (unchanged from existing file).
  - `prefersReducedMotion` from `../../lib/gsap` (Task 1).
  - `useGSAP` from `@gsap/react`, `gsap` from `gsap` (Task 1's `registerPlugin` call already ran once `lib/gsap.ts` is imported anywhere in the tree — this file imports it directly to be self-contained).
  - Types `Clue`, `Grid`, `Guess`, `RoundStatus` from `../../lib/types` (all pre-existing).
  - DOM contract from Task 3: `[data-row][data-col]` on every swatch, bare `[data-target]` on the target swatch only.
- Produces: `Reveal` component with this exact prop interface (Task 6 depends on it):
  ```ts
  interface RevealProps {
    readonly clue: Clue;
    readonly grid: Grid;
    readonly guesses: readonly Guess[];
    readonly best: Guess | null;
    readonly status: "solved" | "failed";
    readonly verdict: string;
    readonly score: number;
    readonly breakdown: { readonly base: number; readonly penalty: number };
    readonly actionLabel: string;
    readonly onAction: () => void;
  }
  ```

- [ ] **Step 1: Write `components/game/Reveal.tsx`**

```tsx
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../lib/gsap";
import type { Clue, Grid, Guess } from "../../lib/types";
import { ColorCard } from "./ColorCard";

interface RevealProps {
  readonly clue: Clue;
  readonly grid: Grid;
  readonly guesses: readonly Guess[];
  readonly best: Guess | null;
  readonly status: "solved" | "failed";
  readonly verdict: string;
  readonly score: number;
  readonly breakdown: { readonly base: number; readonly penalty: number };
  readonly actionLabel: string;
  readonly onAction: () => void;
}

const HAPTIC_FAIL = [40];
const HAPTIC_SUCCESS = [30, 60, 30, 60, 30];

function vibrate(pattern: number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

/**
 * S3 clímax (PRD §7.2). Props puros — sin useGame() — para que el duelo
 * (Sprint 4) pueda reutilizarlo tal cual, per la decisión con Miguel.
 */
export function Reveal({
  clue,
  grid,
  guesses,
  best,
  status,
  verdict,
  score,
  breakdown,
  actionLabel,
  onAction,
}: RevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const wordSwatchRef = useRef<HTMLDivElement>(null);

  const target = grid.target;
  const showLine = best !== null && (best.row !== target.row || best.col !== target.col);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const container = containerRef.current;
      if (!container) return;

      const tl = gsap.timeline();

      // 0.0s — atenuar swatches no-objetivo (el CSS ya las deja en 0.35 por
      // defecto — partimos de opacidad 1 y bajamos, para que el estado sin
      // JS ya sea el correcto).
      const nonTarget = container.querySelectorAll<HTMLElement>("[data-row]:not([data-target])");
      gsap.set(nonTarget, { opacity: 1 });
      tl.to(nonTarget, { opacity: 0.35, duration: 0.3 }, 0);

      // 0.2s — pulso del objetivo
      const targetEl = container.querySelector<HTMLElement>("[data-target]");
      if (targetEl) {
        tl.fromTo(
          targetEl,
          { scale: 1 },
          { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.inOut" },
          0.2,
        );
      }

      // 0.5s — línea punteada mejor-tiro → objetivo (transform-only: ver spec §"Conflicto stroke-dashoffset")
      if (showLine && best && targetEl && lineRef.current) {
        const bestEl = container.querySelector<HTMLElement>(
          `[data-row="${best.row}"][data-col="${best.col}"]`,
        );
        if (bestEl) {
          const containerRect = container.getBoundingClientRect();
          const fromRect = bestEl.getBoundingClientRect();
          const toRect = targetEl.getBoundingClientRect();
          const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
          const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
          const x2 = toRect.left + toRect.width / 2 - containerRect.left;
          const y2 = toRect.top + toRect.height / 2 - containerRect.top;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.hypot(dx, dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          gsap.set(lineRef.current, {
            left: x1,
            top: y1,
            width: length,
            rotate: angle,
            scaleX: 0,
            opacity: 1,
            transformOrigin: "left center",
          });
          tl.to(lineRef.current, { scaleX: 1, duration: 0.3, ease: "power2.out" }, 0.5);
        }
      }

      // 0.8s — cross-fade de la pista (opacity-only: ver spec §"Conflicto filter")
      if (clue.type === "image") {
        const colorImg = container.querySelector<HTMLElement>("[data-clue-color]");
        if (colorImg) {
          gsap.set(colorImg, { opacity: 0 });
          tl.to(colorImg, { opacity: 1, duration: 0.9, ease: "none" }, 0.8);
        }
      } else if (wordSwatchRef.current) {
        gsap.set(wordSwatchRef.current, { scale: 0 });
        tl.to(wordSwatchRef.current, { scale: 1, duration: 0.4, ease: "back.out(1.7)" }, 0.8);
      }

      // 1.1s — score cuenta hacia arriba + háptico
      if (scoreRef.current) {
        const counter = { value: 0 };
        tl.to(
          counter,
          {
            value: score,
            duration: 0.5,
            ease: "power2.out",
            onUpdate: () => {
              if (scoreRef.current) scoreRef.current.textContent = String(Math.round(counter.value));
            },
          },
          1.1,
        );
      }
      tl.call(() => vibrate(status === "solved" ? HAPTIC_SUCCESS : HAPTIC_FAIL), [], 1.1);

      // 1.4s — panel de acciones
      const panel = container.querySelector<HTMLElement>("[data-action-panel]");
      if (panel) {
        gsap.set(panel, { y: 24, opacity: 0 });
        tl.to(panel, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, 1.4);
      }
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className="relative flex w-full max-w-xs flex-col items-center gap-6">
      {clue.type === "word" ? (
        <div className="flex w-full items-center gap-3 rounded-[var(--radius-panel)] bg-surface-1 p-3">
          <div className="flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
              Pista
            </span>
            <p className="mt-1 font-sans text-xl text-text">{clue.word}</p>
          </div>
          <div
            ref={wordSwatchRef}
            className="h-12 w-12 shrink-0 rounded-[var(--radius-swatch)]"
            style={{ backgroundColor: clue.targetHex }}
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="w-full rounded-[var(--radius-panel)] bg-surface-1 p-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
            Pista
          </span>
          <div className="relative mt-2 h-24 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={clue.imageSrc}
              alt="Pista visual"
              className="absolute inset-0 h-full w-full rounded-[var(--radius-swatch)] object-cover grayscale"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-clue-color
              src={clue.imageSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full rounded-[var(--radius-swatch)] object-cover"
            />
          </div>
        </div>
      )}

      <ColorCard grid={grid} guesses={guesses} disabled revealTarget onTap={() => {}} />

      <div
        ref={lineRef}
        className="pointer-events-none absolute h-0.5 origin-left border-t-2 border-dotted border-signal opacity-0"
      />

      <div className="text-center">
        <p className="font-sans text-lg text-text">{verdict}</p>
        <p className="mt-1 font-mono text-3xl font-bold text-signal">
          <span ref={scoreRef}>{score}</span>
        </p>
        {breakdown.penalty > 0 && (
          <p className="mt-0.5 font-mono text-xs text-text-faint">
            {breakdown.base} − {breakdown.penalty}
          </p>
        )}
      </div>

      <div data-action-panel className="w-full">
        <button
          type="button"
          onClick={onAction}
          className="w-full rounded-[var(--radius-panel)] bg-signal py-3 font-sans text-sm font-medium text-signal-ink"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If `@gsap/react`'s `useGSAP` types complain about the dependency array, confirm `{ scope: containerRef }` is being passed as the second argument (config object, not a deps array) — that's the correct v2 API.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/game/Reveal.tsx
git commit -m "feat: add Reveal component with GSAP choreography (PRD §7.2)"
```

---

### Task 6: Wire `Reveal` into `components/screens/Play.tsx`

**Files:**
- Modify: `components/screens/Play.tsx` (full file, currently 127 lines)

**Interfaces:**
- Consumes: `Reveal` from `../game/Reveal` (Task 5), `scoreBreakdown` from `../../lib/engine` (Task 2, alongside the already-imported `bestGuess`).
- Produces: nothing new for later tasks — this is the integration point.

- [ ] **Step 1: Rewrite `components/screens/Play.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { bestGuess, scoreBreakdown } from "../../lib/engine";
import { buildGrid } from "../../lib/grid";
import { DIFFICULTY } from "../../lib/types";
import type { HintKind } from "../../lib/types";
import { ClueBar } from "../game/ClueBar";
import { ColorCard } from "../game/ColorCard";
import { HintRow } from "../game/HintRow";
import { Reveal } from "../game/Reveal";
import { Thermometer } from "../game/Thermometer";

/**
 * S3 — pantalla principal (PRD §6: "todo lo demás existe para llegar a ella
 * o cerrarla"). El reveal delega en Reveal.tsx (PRD §7.2, Sprint 3).
 */

function verdictFor(ring: number): string {
  if (ring === 0) return "Clavado.";
  if (ring === 1) return "A un matiz.";
  if (ring === 2) return "Buen ojo.";
  return "Ese matiz engaña.";
}

export function Play() {
  const { state, dispatch } = useGame();
  const [confirmingExit, setConfirmingExit] = useState(false);
  const round = state.currentRound !== null ? state.rounds[state.currentRound] : null;

  // round.gridSpec no cambia de referencia entre GUESS/REQUEST_HINT (el
  // reducer solo actualiza guesses/hints/status/score) — memoizar sobre él,
  // no sobre `round`, evita repetir la búsqueda binaria de buildGrid en
  // cada tiro.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(() => (round ? buildGrid(round.gridSpec) : null), [round?.gridSpec]);

  if (!round || !grid) return null;

  const isPlaying = round.status === "playing";
  const lastGuess = round.guesses[round.guesses.length - 1];
  const best = bestGuess(round);

  function handleTap(row: number, col: number) {
    dispatch({ type: "GUESS", row, col });
  }

  function handleHint(kind: HintKind) {
    dispatch({ type: "REQUEST_HINT", kind });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center gap-6 px-4 pt-10 pb-6">
      <div className="flex w-full max-w-xs items-center justify-between">
        {!confirmingExit ? (
          <button
            type="button"
            onClick={() => setConfirmingExit(true)}
            aria-label="Volver"
            className="font-mono text-lg text-text-muted"
          >
            ←
          </button>
        ) : (
          <div className="flex items-center gap-2 font-sans text-xs">
            <span className="text-text-muted">¿Salir? Perderás la ronda.</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "GO_HOME" })}
              className="text-signal"
            >
              Salir
            </button>
            <button
              type="button"
              onClick={() => setConfirmingExit(false)}
              className="text-text-muted"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {isPlaying ? (
        <>
          <ClueBar clue={round.clue} />
          <ColorCard
            grid={grid}
            guesses={round.guesses}
            disabled={false}
            revealTarget={false}
            onTap={handleTap}
          />
          <div className="w-full max-w-xs">
            <Thermometer closeness={lastGuess?.closeness ?? null} />
          </div>
          <HintRow
            hints={round.hints}
            maxHints={DIFFICULTY[state.config.difficulty].maxHints}
            hasGuessed={round.guesses.length > 0}
            disabled={!isPlaying}
            onRequestHint={handleHint}
          />
        </>
      ) : (
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          status={round.status === "solved" ? "solved" : "failed"}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel="Otra ronda"
          onAction={() => dispatch({ type: "NEXT" })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, test, lint, build**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: PASS on all four.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Play.tsx
git commit -m "feat: wire Reveal choreography into Play screen"
```

---

### Task 7: Browser verification (Playwright)

**Files:** none — verification only, no code changes expected unless a bug is found (if so, fix in the relevant task's file and re-run this task).

- [ ] **Step 1: Start dev server**

Run: `pnpm dev` (note actual port from output — port 3000 has been occupied by another process in past sessions, falling back to 3002).

- [ ] **Step 2: Full-motion walkthrough**

Navigate to the app, play a solo round to reveal (word clue). Confirm via Playwright snapshot/screenshot at intervals:
- Non-target swatches visibly dim shortly after reveal starts.
- Target swatch gets a brief scale pulse.
- If the best guess wasn't the target, a dotted amber line appears between best-guess and target.
- The word's color swatch grows in next to the clue text.
- Score counts up from 0 to the final number.
- Action panel ("Otra ronda") slides up from below.
- No console errors (`mcp__plugin_playwright_playwright__browser_console_messages`).

- [ ] **Step 3: "Clavado" case (no line)**

Force an exact-match round (guess the target on the first try, achievable by reading the seed/grid via a temporary `console.log` or by trying a few cells). Confirm no line artifact appears anywhere (check no stray dot/line at top-left of the card — this is the exact regression risk called out in the spec's line-opacity fix).

- [ ] **Step 4: Image clue path**

Play a round with an image clue. Confirm the photo cross-fades from grayscale to color (not an instant snap, not an animated `filter`) between t=0.8s and t=1.7s.

- [ ] **Step 5: `prefers-reduced-motion` emulation**

Use `browser_evaluate` or Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })` equivalent (check the MCP tool's parameters — if not directly exposed, set it via `mcp__plugin_playwright_playwright__browser_evaluate` injecting a matchMedia override before navigation, or use OS-level emulation if available) and reload into a reveal state. Confirm:
- Dimmed swatches, drawn line (if applicable), colored photo, final score, and visible action panel are ALL present immediately — no animation, no missing data.
- No console errors.

- [ ] **Step 6: Failing round → short haptic path (visual proxy only)**

`navigator.vibrate` can't be observed visually in Playwright — instead, stub it via `browser_evaluate` (`navigator.vibrate = (p) => { window.__vibrated = p; }` before the round starts) and read `window.__vibrated` after reveal to confirm the correct pattern fired for a failed round (`[40]`) vs a solved one (`[30,60,30,60,30]`).

- [ ] **Step 7: Regression check on the playing state**

Confirm swatches during active play (not reveal) still look and behave exactly as before Sprint 3 — tap works, hint row works, no dimming, no data-attribute-driven visual change leaking into the playing state.

- [ ] **Step 8: Fix any bugs found, re-run the relevant task's verification, then final full suite**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in Sprint 3 browser walkthrough"
```

(Skip this commit if Step 8 found nothing to fix.)

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** `lib/gsap.ts` (Task 1) ✓, `scoreBreakdown`/audit line (Task 2, 5) ✓, dim to 0.35 (Task 3, 5) ✓, target pulse (Task 5) ✓, line via transform (Task 5) ✓, photo cross-fade via opacity (Task 5) ✓, word-clue growing swatch (Task 5) ✓, score count-up + haptic (Task 5) ✓, action panel entry (Task 5) ✓, reduced-motion CSS (Task 4) + JS skip (Task 5) ✓, generic props / no `useGame()` in `Reveal` (Task 5) ✓.
- **Type consistency checked:** `RevealProps` in Task 5's interface block matches the exact shape used by `Play.tsx` in Task 6 (`status: "solved" | "failed"`, `score: number`, `breakdown: {base, penalty}`). `scoreBreakdown`'s return type in Task 2 matches what Task 6 passes straight through to `breakdown`.
- **Known gap, deliberately out of scope:** the pre-existing deferred grid-gamut/target-pop-out bug in `lib/grid.ts` is untouched by this plan — do not reopen it here.
