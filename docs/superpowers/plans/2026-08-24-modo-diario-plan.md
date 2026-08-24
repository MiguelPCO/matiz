# Modo Diario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Modo Diario — a shared daily color puzzle (fixed 6×6/Medio, no clue, no picker) with a text share card, as a standalone system that never touches `lib/engine.ts` or `GameState`.

**Architecture:** New pure module `lib/daily.ts` derives a deterministic `GridSpec` from the device-local date via FNV-1a hash → `mulberry32`. A standalone `useReducer` hook (`hooks/useDaily.ts`) owns a single `Round`, mirroring `lib/engine.ts`'s `applyGuess`/`applyHint` scoring formulas (duplicated on purpose — those two functions aren't exported and are shaped around `GameState`) while reusing `bestGuess`/`scoreRound`/`scoreBreakdown` directly (those three already operate on `Round` alone and are exported). A new route `app/diario/page.tsx` renders a new screen `components/screens/Diario.tsx` built from the same pure UI components (`ColorCard`, `Thermometer`, `HintRow`, `Reveal`) Solo/Duelo already use. `Reveal.tsx` gets one additive change: `clue` becomes optional.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, `localStorage` (new to this project), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-modo-diario-design.md`

## Global Constraints

- Fixed config: 6×6 / Medio for every player, every day — no picker, no variation (spec §"Config fija").
- Day boundary is device-local midnight (`localDateKey`), never UTC.
- `localStorage` key `"matiz-daily-v1"`, written exactly once, when the round ends. No streak/history — only today's result is ever kept.
- Diario has **no clue** at all — no `ClueBar` in the playing screen, no "Pista" panel in the result screen.
- Share card is plain text only (Wordle-style) — no image/canvas generation.
- Zero changes to `lib/engine.ts` or `GameState`/`useGame` — Diario is fully standalone.
- `Reveal.tsx`'s `clue` prop change must be additive/non-breaking: Solo and Duelo always pass `clue`, so their behavior must not change.
- Curated target color range `L∈[0.4,0.72]`, `C∈[0.06,0.16]` — deliberately avoids the saturated-target gamut/`shiftC` residual documented in `MATIZ-SPRINTS.md` (not fixed, just avoided).
- No component tests (project convention — SCHEMA §11 only mandates `lib/`-level tests; confirmed zero existing `*.test.tsx` files).
- Commits authored solely as "Miguel" — no AI co-author trailer (project convention).

---

### Task 1: `lib/daily.ts` — deterministic puzzle generation

**Files:**
- Create: `lib/daily.ts`
- Test: `lib/daily.test.ts`

**Interfaces:**
- Produces: `localDateKey(d?: Date): string`, `buildDailyGridSpec(d?: Date): GridSpec` — both consumed by `hooks/useDaily.ts` (Task 3) and `components/screens/Diario.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `lib/daily.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hexToOklch } from "./color";
import { buildDailyGridSpec, localDateKey } from "./daily";

describe("daily.localDateKey", () => {
  it("misma fecha local produce la misma clave, sin importar la hora", () => {
    const early = new Date(2026, 7, 23, 0, 0, 1);
    const late = new Date(2026, 7, 23, 23, 59, 59);
    expect(localDateKey(early)).toBe("2026-08-23");
    expect(localDateKey(late)).toBe("2026-08-23");
  });

  it("un día distinto produce una clave distinta", () => {
    expect(localDateKey(new Date(2026, 7, 24, 0, 0, 1))).toBe("2026-08-24");
  });
});

describe("daily.buildDailyGridSpec", () => {
  it("misma fecha produce siempre el mismo GridSpec", () => {
    const date = new Date(2026, 7, 23);
    const a = buildDailyGridSpec(date);
    const b = buildDailyGridSpec(date);
    expect(b).toEqual(a);
  });

  it("config fija: 6x6 / medio para todas las fechas", () => {
    for (let i = 0; i < 30; i++) {
      const spec = buildDailyGridSpec(new Date(2026, 0, i + 1));
      expect(spec.size).toBe(6);
      expect(spec.difficulty).toBe("medio");
    }
  });

  it("targetHex cae dentro del rango curado L∈[0.4,0.72]/C∈[0.06,0.16] (margen 0.01 por redondeo de 8 bits)", () => {
    const MARGIN = 0.01;
    for (let i = 0; i < 30; i++) {
      const spec = buildDailyGridSpec(new Date(2026, 0, i + 1));
      const { L, C } = hexToOklch(spec.targetHex);
      expect(L).toBeGreaterThanOrEqual(0.4 - MARGIN);
      expect(L).toBeLessThanOrEqual(0.72 + MARGIN);
      expect(C).toBeGreaterThanOrEqual(0.06 - MARGIN);
      expect(C).toBeLessThanOrEqual(0.16 + MARGIN);
    }
  });

  it("fechas distintas producen targetHex distinto en la gran mayoría de pares (colisión por azar acotada)", () => {
    const hexes = new Set<string>();
    const N = 60;
    for (let i = 0; i < N; i++) {
      hexes.add(buildDailyGridSpec(new Date(2026, 0, i + 1)).targetHex);
    }
    expect(hexes.size).toBeGreaterThanOrEqual(N - 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test daily.test.ts`
Expected: FAIL — `lib/daily.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/daily.ts`:

```ts
import { oklchToHex } from "./color";
import { rng } from "./grid";
import type { GridSpec, Guess, Hint, RoundStatus, Seed } from "./types";

/**
 * Generación pura del puzzle diario — ver
 * docs/superpowers/specs/2026-08-23-modo-diario-design.md. Determinista por
 * fecha LOCAL del dispositivo (medianoche local, no UTC — decisión
 * confirmada: sin backend, más simple).
 */

const TARGET_L_RANGE = [0.4, 0.72] as const;
const TARGET_C_RANGE = [0.06, 0.16] as const;

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// FNV-1a de 32 bits.
function hashSeed(key: string): Seed {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function buildDailyGridSpec(d: Date = new Date()): GridSpec {
  const key = localDateKey(d);
  const next = rng(hashSeed(key));
  const L = TARGET_L_RANGE[0] + next() * (TARGET_L_RANGE[1] - TARGET_L_RANGE[0]);
  const C = TARGET_C_RANGE[0] + next() * (TARGET_C_RANGE[1] - TARGET_C_RANGE[0]);
  const H = next() * 360;
  const targetHex = oklchToHex({ L, C, H });

  // Seed de layout distinto al de color — evita correlacionar tr/tc con
  // L/C/H (el mismo seed compartiría los primeros next() calls).
  const layoutSeed = hashSeed(`${key}|layout`);

  return { seed: layoutSeed, size: 6, difficulty: "medio", targetHex };
}

export interface DailyResult {
  readonly guesses: readonly Guess[];
  readonly hints: readonly Hint[];
  readonly status: Exclude<RoundStatus, "playing">;
  readonly score: number;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test daily.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean (the `DailyResult` export is unused until Task 2/3 — that's fine, it's a type-only export, no unused-value error).

- [ ] **Step 6: Commit**

```bash
git add lib/daily.ts lib/daily.test.ts
git commit -m "feat: deterministic daily puzzle generation"
```

---

### Task 2: `lib/daily.ts` — share text

**Files:**
- Modify: `lib/daily.ts` (append)
- Modify: `lib/daily.test.ts` (append)

**Interfaces:**
- Consumes: `DailyResult` (Task 1).
- Produces: `buildShareText(dateKey: string, result: DailyResult): string` — consumed by `components/screens/Diario.tsx` (Task 5).

- [ ] **Step 1: Write the failing test**

In `lib/daily.test.ts`, change the top import line from:

```ts
import { buildDailyGridSpec, localDateKey } from "./daily";
```

to:

```ts
import { buildDailyGridSpec, buildShareText, localDateKey } from "./daily";
```

Then append to the bottom of the file:

```ts
describe("daily.buildShareText", () => {
  it("formato exacto estilo Wordle para un DailyResult de muestra", () => {
    const text = buildShareText("2026-08-23", {
      guesses: [
        { row: 1, col: 1, hex: "#aabbcc", ring: 2, closeness: 0.4 },
        { row: 2, col: 2, hex: "#bbccdd", ring: 3, closeness: 0.2 },
        { row: 3, col: 3, hex: "#ccddee", ring: 4, closeness: 0.1 },
      ],
      hints: [{ kind: "light", text: "Claro" }],
      status: "failed",
      score: 42,
    });
    expect(text).toBe("MATIZ 2026-08-23\n🟧⬜⬜\n42 pts, 1 pista");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test daily.test.ts`
Expected: FAIL — `buildShareText` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/daily.ts`:

```ts
const RING_EMOJI = ["🟩", "🟨", "🟧"] as const;

export function buildShareText(dateKey: string, result: DailyResult): string {
  const symbols = result.guesses.map((g) => RING_EMOJI[g.ring] ?? "⬜").join("");
  const hintsLabel = result.hints.length === 1 ? "1 pista" : `${result.hints.length} pistas`;
  return `MATIZ ${dateKey}\n${symbols}\n${result.score} pts, ${hintsLabel}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test daily.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/daily.ts lib/daily.test.ts
git commit -m "feat: Wordle-style share text for daily results"
```

---

### Task 3: `hooks/useDaily.ts` — standalone reducer

**Files:**
- Create: `hooks/useDaily.ts`

**Interfaces:**
- Consumes: `buildDailyGridSpec`, `localDateKey`, `DailyResult` (Task 1); `bestGuess`, `scoreRound`, `scoreBreakdown` from `lib/engine.ts` (already exported, operate on `Round` alone — no `GameState` needed); `buildGrid` from `lib/grid.ts`; `deltaE` from `lib/color.ts`; `DIFFICULTY`, `MAX_GUESSES`, `HintKind`, `GridSpec`, `Round` from `lib/types.ts`.
- Produces: `useDaily(): { state: DailyState; dispatch: Dispatch<DailyAction> }`, `DailyState` (`{ phase: "loading"|"playing"|"result"; gridSpec: GridSpec|null; round: Round|null }`), `DailyAction` (`{type:"HYDRATE",cached:DailyResult|null,gridSpec:GridSpec} | {type:"GUESS",row:number,col:number} | {type:"REQUEST_HINT",kind:HintKind}`) — consumed by `components/screens/Diario.tsx` (Task 5).

No dedicated test file for this task (project convention: SCHEMA §11 mandates `lib/`-level tests only — `hooks/useGame.ts` has none either). Correctness is verified by `pnpm typecheck` in Step 2 below and by the live Playwright walkthrough in Task 7.

- [ ] **Step 1: Write the implementation**

Create `hooks/useDaily.ts`:

```ts
"use client";

import { useEffect, useReducer } from "react";
import type { Dispatch } from "react";
import { deltaE } from "../lib/color";
import { buildDailyGridSpec, localDateKey } from "../lib/daily";
import { scoreRound } from "../lib/engine";
import { buildGrid } from "../lib/grid";
import { DIFFICULTY, MAX_GUESSES } from "../lib/types";
import type { DailyResult } from "../lib/daily";
import type { GridSpec, HintKind, Round } from "../lib/types";

/**
 * Estado propio de Diario — useReducer aparte de useGame/lib/engine.ts (ver
 * docs/superpowers/specs/2026-08-23-modo-diario-design.md § Decisión de
 * arquitectura). GUESS/REQUEST_HINT mirroran applyGuess/applyHint de
 * lib/engine.ts línea por línea (esas dos no están exportadas y están
 * atadas a la forma de GameState) — un cambio futuro en las fórmulas de
 * puntuación/pista debe tocar los dos sitios. bestGuess/scoreRound/
 * scoreBreakdown SÍ se reutilizan directamente: ya operan solo sobre Round.
 */

const DAILY_DIFFICULTY = "medio" as const;
const DAILY_SIZE = 6 as const;
const PLACEHOLDER_PLAYER_ID = "daily-player";
const DAILY_STORAGE_KEY = "matiz-daily-v1";

interface DailyStorage {
  readonly date: string;
  readonly result: DailyResult;
}

function readCache(): DailyResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyStorage;
    if (parsed.date !== localDateKey()) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function writeCache(result: DailyResult): void {
  if (typeof window === "undefined") return;
  const payload: DailyStorage = { date: localDateKey(), result };
  window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(payload));
}

export type DailyPhase = "loading" | "playing" | "result";

export interface DailyState {
  readonly phase: DailyPhase;
  readonly gridSpec: GridSpec | null;
  readonly round: Round | null;
}

export type DailyAction =
  | { type: "HYDRATE"; cached: DailyResult | null; gridSpec: GridSpec }
  | { type: "GUESS"; row: number; col: number }
  | { type: "REQUEST_HINT"; kind: HintKind };

const initialDailyState: DailyState = { phase: "loading", gridSpec: null, round: null };

function chebyshev(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

// Espejo de applyGuess en lib/engine.ts — ver comentario de cabecera.
function applyDailyGuess(round: Round, gridSpec: GridSpec, row: number, col: number): Round {
  if (round.status !== "playing") return round;
  if (round.guesses.some((g) => g.row === row && g.col === col)) return round;

  const grid = buildGrid(gridSpec);
  const cell = grid.cells[row]?.[col];
  if (!cell) return round;

  const ring = chebyshev({ row, col }, grid.target);
  const closeness = Math.max(
    0,
    Math.min(1, 1 - deltaE(cell.hex, round.clue.targetHex) / grid.maxDeltaE),
  );
  const guesses = [...round.guesses, { row, col, hex: cell.hex, ring, closeness }];
  const over = ring === 0 || guesses.length >= MAX_GUESSES;
  const status: Round["status"] = over ? (ring === 0 ? "solved" : "failed") : "playing";

  return {
    ...round,
    guesses,
    status,
    score: over ? scoreRound({ ...round, guesses, status, score: null }) : null,
  };
}

// Espejo de applyHint en lib/engine.ts — ver comentario de cabecera.
function applyDailyHint(round: Round, gridSpec: GridSpec, kind: HintKind): Round {
  if (round.status !== "playing") return round;
  const maxHints = DIFFICULTY[DAILY_DIFFICULTY].maxHints;
  if (round.hints.length >= maxHints) return round;
  if (round.hints.some((h) => h.kind === kind)) return round;
  if (kind === "dir" && round.guesses.length === 0) return round;

  const grid = buildGrid(gridSpec);
  const target = grid.target;
  const n = DAILY_SIZE - 1 || 1;

  let text: string;
  if (kind === "light") {
    const r = target.col / n;
    text = r < 0.34 ? "Oscuro" : r < 0.67 ? "Medio" : "Claro";
  } else if (kind === "sat") {
    const r = (n - target.row) / n;
    text = r < 0.34 ? "Apagado" : r < 0.67 ? "Medio" : "Vivo";
  } else {
    const last = round.guesses[round.guesses.length - 1];
    if (!last) return round;
    const vertical = target.row < last.row ? "arriba" : target.row > last.row ? "abajo" : null;
    const horizontal = target.col < last.col ? "izquierda" : target.col > last.col ? "derecha" : null;
    const arrows: Record<string, string> = {
      "arriba-izquierda": "↖",
      "arriba-derecha": "↗",
      "abajo-izquierda": "↙",
      "abajo-derecha": "↘",
      arriba: "↑",
      abajo: "↓",
      izquierda: "←",
      derecha: "→",
    };
    const key = [vertical, horizontal].filter((v): v is string => v !== null).join("-");
    text = key ? `${key.replace("-", " · ")} ${arrows[key]}` : "aquí mismo";
  }

  return { ...round, hints: [...round.hints, { kind, text }] };
}

function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case "HYDRATE": {
      const round: Round = {
        id: "daily",
        guesserId: PLACEHOLDER_PLAYER_ID,
        setterId: null,
        clue: { type: "word", word: "", targetHex: action.gridSpec.targetHex },
        gridSpec: action.gridSpec,
        guesses: action.cached?.guesses ?? [],
        hints: action.cached?.hints ?? [],
        status: action.cached?.status ?? "playing",
        score: action.cached?.score ?? null,
      };
      return { phase: action.cached ? "result" : "playing", gridSpec: action.gridSpec, round };
    }
    case "GUESS": {
      if (state.phase !== "playing" || !state.round || !state.gridSpec) return state;
      const round = applyDailyGuess(state.round, state.gridSpec, action.row, action.col);
      return { ...state, round, phase: round.status !== "playing" ? "result" : "playing" };
    }
    case "REQUEST_HINT": {
      if (state.phase !== "playing" || !state.round || !state.gridSpec) return state;
      const round = applyDailyHint(state.round, state.gridSpec, action.kind);
      return { ...state, round };
    }
    default:
      return state;
  }
}

export function useDaily(): { state: DailyState; dispatch: Dispatch<DailyAction> } {
  const [state, dispatch] = useReducer(dailyReducer, initialDailyState);

  useEffect(() => {
    const gridSpec = buildDailyGridSpec();
    dispatch({ type: "HYDRATE", cached: readCache(), gridSpec });
  }, []);

  useEffect(() => {
    const round = state.round;
    if (state.phase !== "result" || !round || round.status === "playing") return;
    if (readCache()) return;
    writeCache({ guesses: round.guesses, hints: round.hints, status: round.status, score: round.score ?? 0 });
  }, [state.phase, state.round]);

  return { state, dispatch };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean. Pay special attention to the narrowing in the second `useEffect` — `round.status` after the guard `round.status === "playing"` must narrow to `Exclude<RoundStatus, "playing">` to satisfy `DailyResult["status"]`. If TS complains, it means the guard was rewritten to check `state.round.status` instead of the local `round` const — keep the local `const round = state.round;` binding exactly as written above so narrowing holds.

- [ ] **Step 3: Run full suite (no regressions)**

Run: `pnpm test`
Expected: PASS (all existing tests + Task 1/2's `daily.test.ts`, unaffected by this hook)

- [ ] **Step 4: Commit**

```bash
git add hooks/useDaily.ts
git commit -m "feat: standalone reducer for Modo Diario"
```

---

### Task 4: `components/game/Reveal.tsx` — optional `clue`

**Files:**
- Modify: `components/game/Reveal.tsx:10-11` (interface), `components/game/Reveal.tsx:124-133` (GSAP cross-fade guard), `components/game/Reveal.tsx:167-204` (JSX panel)

**Interfaces:**
- Produces: `RevealProps.clue?: Clue` (was required) — consumed by `components/screens/Diario.tsx` (Task 5), which omits it entirely; `components/screens/Play.tsx` keeps passing `clue` unchanged (Solo/Duelo behavior must not change).

- [ ] **Step 1: Make `clue` optional in the props interface**

In `components/game/Reveal.tsx`, change:

```ts
interface RevealProps {
  readonly clue: Clue;
```

to:

```ts
interface RevealProps {
  readonly clue?: Clue;
```

- [ ] **Step 2: Guard the GSAP cross-fade step**

Change:

```ts
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
```

to:

```ts
      // 0.8s — cross-fade de la pista (opacity-only: ver spec §"Conflicto filter")
      // clue undefined (Diario, sin pista) salta este paso por completo.
      if (clue?.type === "image") {
        const colorImg = container.querySelector<HTMLElement>("[data-clue-color]");
        if (colorImg) {
          gsap.set(colorImg, { opacity: 0 });
          tl.to(colorImg, { opacity: 1, duration: 0.9, ease: "none" }, 0.8);
        }
      } else if (clue && wordSwatchRef.current) {
        gsap.set(wordSwatchRef.current, { scale: 0 });
        tl.to(wordSwatchRef.current, { scale: 1, duration: 0.4, ease: "back.out(1.7)" }, 0.8);
      }
```

- [ ] **Step 3: Guard the "Pista" panel JSX**

Change the return block's opening:

```tsx
  return (
    <div ref={containerRef} className="relative flex w-full max-w-xs flex-col items-center gap-6">
      {clue.type === "word" ? (
```

to:

```tsx
  return (
    <div ref={containerRef} className="relative flex w-full max-w-xs flex-col items-center gap-6">
      {clue && (clue.type === "word" ? (
```

and its closing (currently the `)` right before `<ColorCard`):

```tsx
        </div>
      )}

      <ColorCard grid={grid} guesses={guesses} disabled revealTarget onTap={() => {}} />
```

to:

```tsx
        </div>
      ))}

      <ColorCard grid={grid} guesses={guesses} disabled revealTarget onTap={() => {}} />
```

- [ ] **Step 4: Typecheck and full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: both clean/green — `Play.tsx` always passes `clue`, so its render path is unaffected; no existing test touches `Reveal.tsx` directly (no component tests in this project).

- [ ] **Step 5: Commit**

```bash
git add components/game/Reveal.tsx
git commit -m "feat: make Reveal's clue prop optional for Modo Diario"
```

---

### Task 5: `components/screens/Diario.tsx` + `app/diario/page.tsx`

**Files:**
- Create: `components/screens/Diario.tsx`
- Create: `app/diario/page.tsx`

**Interfaces:**
- Consumes: `useDaily` (Task 3); `buildShareText`, `localDateKey` (Task 1/2); `Reveal` with optional `clue` (Task 4); `bestGuess`, `scoreBreakdown` from `lib/engine.ts`; `buildGrid` from `lib/grid.ts`; `ColorCard`, `HintRow`, `Thermometer` (existing, unchanged); `DIFFICULTY` from `lib/types.ts`.

- [ ] **Step 1: Write `components/screens/Diario.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDaily } from "../../hooks/useDaily";
import { buildShareText, localDateKey } from "../../lib/daily";
import { bestGuess, scoreBreakdown } from "../../lib/engine";
import { buildGrid } from "../../lib/grid";
import { DIFFICULTY } from "../../lib/types";
import type { HintKind } from "../../lib/types";
import { ColorCard } from "../game/ColorCard";
import { HintRow } from "../game/HintRow";
import { Reveal } from "../game/Reveal";
import { Thermometer } from "../game/Thermometer";

/**
 * Diario — ruta propia, no pasa por el switch(state.phase) de Solo/Duelo
 * (ver docs/superpowers/specs/2026-08-23-modo-diario-design.md). Sin pista:
 * no hay ClueBar en juego, ni panel "Pista" en el reveal.
 */

function verdictFor(ring: number): string {
  if (ring === 0) return "Clavado.";
  if (ring === 1) return "A un matiz.";
  if (ring === 2) return "Buen ojo.";
  return "Ese matiz engaña.";
}

export function Diario() {
  const { state, dispatch } = useDaily();
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(
    () => (state.round ? buildGrid(state.round.gridSpec) : null),
    [state.round?.gridSpec],
  );

  if (state.phase === "loading" || !state.round || !grid) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Cargando el matiz de hoy…
        </p>
      </main>
    );
  }

  const round = state.round;
  const lastGuess = round.guesses[round.guesses.length - 1];
  const best = bestGuess(round);

  function handleTap(row: number, col: number) {
    dispatch({ type: "GUESS", row, col });
  }

  function handleHint(kind: HintKind) {
    dispatch({ type: "REQUEST_HINT", kind });
  }

  async function handleShare() {
    const text = buildShareText(localDateKey(), {
      guesses: round.guesses,
      hints: round.hints,
      status: round.status === "solved" ? "solved" : "failed",
      score: round.score ?? 0,
    });
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await navigator.share({ text });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 1500);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center gap-6 px-4 pt-10 pb-6">
      <div className="flex w-full max-w-xs items-center justify-between">
        <Link href="/" aria-label="Volver" className="font-mono text-lg text-text-muted">
          ←
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Diario · {localDateKey()}
        </span>
      </div>

      {state.phase === "playing" ? (
        <>
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
            maxHints={DIFFICULTY.medio.maxHints}
            hasGuessed={round.guesses.length > 0}
            disabled={false}
            onRequestHint={handleHint}
          />
        </>
      ) : (
        <>
          <Reveal
            grid={grid}
            guesses={round.guesses}
            best={best}
            verdict={verdictFor(best?.ring ?? 99)}
            score={round.score ?? 0}
            breakdown={scoreBreakdown(round)}
            actionLabel={shareStatus === "copied" ? "Copiado" : "Compartir resultado"}
            onAction={handleShare}
          />
          <Link href="/" className="font-sans text-sm text-text-muted underline">
            Volver a inicio
          </Link>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/diario/page.tsx`**

```tsx
import { Diario } from "../../components/screens/Diario";

export default function DiarioPage() {
  return <Diario />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean. `Reveal` is called without a `clue` prop here — this only compiles because Task 4 made it optional; if this fails, re-check Task 4 was applied first.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: succeeds, `app/diario` appears as a static/prerendered route in the build output.

- [ ] **Step 5: Commit**

```bash
git add components/screens/Diario.tsx app/diario/page.tsx
git commit -m "feat: Modo Diario screen and route"
```

---

### Task 6: `components/screens/Home.tsx` — unlock Diario

**Files:**
- Modify: `components/screens/Home.tsx:1-9` (imports), `components/screens/Home.tsx:97-99` (button)

- [ ] **Step 1: Add the `Link` import**

Change:

```ts
"use client";

import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { oklchToHex } from "../../lib/color";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { HowToPlay } from "./HowToPlay";
```

to:

```ts
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { oklchToHex } from "../../lib/color";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { HowToPlay } from "./HowToPlay";
```

- [ ] **Step 2: Replace the disabled Diario button with a link**

Change:

```tsx
          <Button variant="secondary" disabled aria-disabled="true">
            Diario · Próximamente
          </Button>
```

to:

```tsx
          <Link
            href="/diario"
            className="rounded-[var(--radius-panel)] border border-line py-3 text-center font-sans text-sm font-medium text-text"
          >
            Diario
          </Link>
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add components/screens/Home.tsx
git commit -m "feat: unlock Diario entry point from Home"
```

---

### Task 7: Full verification, SPRINTS doc update, live walkthrough

**Files:**
- Modify: `MATIZ-SPRINTS.md`

- [ ] **Step 1: Full automated verification**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all four green, zero errors/warnings.

- [ ] **Step 2: Update `MATIZ-SPRINTS.md`**

Insert a new section after the existing `## Sprint 5 — Pulido y lanzamiento` section (after its `---` at line 177) and before `## Resumen de dependencias`:

```markdown
## Sprint 6 — Modo Diario

**Objetivo:** un matiz compartido al día, jugable y compartible, sin tocar el motor de Solo/Duelo.

### Tareas

- [x] `lib/daily.ts` — `localDateKey`, hash FNV-1a → seed, `buildDailyGridSpec` (rango curado L∈[0.4,0.72]/C∈[0.06,0.16])
- [x] `lib/daily.ts` — `buildShareText`, tarjeta de resultado estilo Wordle
- [x] `hooks/useDaily.ts` — `useReducer` propio, sin tocar `useGame`/`lib/engine.ts`; GUESS/REQUEST_HINT espejan `applyGuess`/`applyHint`
- [x] Persistencia `localStorage["matiz-daily-v1"]` — un resultado por día, sin histórico
- [x] `components/game/Reveal.tsx` — `clue` opcional (aditivo, Solo/Duelo sin cambios)
- [x] `app/diario/page.tsx` + `components/screens/Diario.tsx` — sin `ClueBar`, sin panel de pista
- [x] `components/screens/Home.tsx` — Diario desbloqueado

### Aceptación

- Home → Diario → jugar una ronda → Reveal sin panel de pista → compartir/copiar resultado
- Recargar la página cachea el resultado del día (bloquea replay); un día distinto permite jugar de nuevo
- Cero cambios en `lib/engine.ts`

---
```

- [ ] **Step 3: Commit the doc update**

```bash
git add MATIZ-SPRINTS.md
git commit -m "docs: close Sprint 6 — Modo Diario"
```

- [ ] **Step 4: Live Playwright walkthrough**

Load the Playwright MCP tools (`ToolSearch` with `select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_press_key`), start the dev server (`pnpm dev` in the background), then walk through:

1. Navigate to `http://localhost:3000`. Confirm the "Diario" button is enabled (no "Próximamente" badge) and click it.
2. Confirm the URL is `/diario`, the grid renders (no `ClueBar`/"Pista" text anywhere on screen), and the `Thermometer` shows the "Toca el matiz que creas correcto." placeholder.
3. Tap swatches until the round resolves (solved or the 3-guess cap is hit). Confirm the `Reveal` screen shows **no** "Pista" panel, and the action button reads "Compartir resultado" with a secondary "Volver a inicio" link below it.
4. Click "Compartir resultado". Since Playwright's browser context has no `navigator.share`, confirm it falls back to `navigator.clipboard.writeText` and the button label flips to "Copiado" (use `browser_evaluate` to read `navigator.clipboard.readText()` if permissions allow, or just confirm the label change via `browser_snapshot`).
5. Reload the page (`browser_navigate` to the same `/diario` URL). Confirm it skips straight to the cached result (no fresh round, same score as before) — this proves the `localStorage` write-once/hydrate-on-mount logic works.
6. Use `browser_evaluate` to run `() => { const raw = JSON.parse(localStorage.getItem("matiz-daily-v1")); raw.date = "2000-01-01"; localStorage.setItem("matiz-daily-v1", JSON.stringify(raw)); }`, then reload. Confirm a **different day** in storage starts a fresh playable round instead of the cached result — proves the date-comparison gate works both ways.
7. Navigate back to `/` and confirm Solo still plays end-to-end with its `ClueBar`/"Pista" panel intact in `Reveal` (proves Task 4's `clue` change didn't regress Solo).

If any step fails, stop and report — do not proceed to marking the sprint accepted.

- [ ] **Step 5: Report status to Miguel**

Summarize: automated suite status, walkthrough results, and the exact commits made this session (hashes + one-line messages). Do not push without explicit approval (matches this project's established convention from prior sprints).
