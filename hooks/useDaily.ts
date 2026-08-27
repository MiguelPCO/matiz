"use client";

import { useEffect, useReducer } from "react";
import type { Dispatch } from "react";
import { colorWord } from "../lib/color-word";
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

const PLACEHOLDER_PLAYER_ID = "daily-player";
const DAILY_STORAGE_KEY = "matiz-daily-v1";
const DAILY_WORD_STORAGE_KEY = "matiz-daily-word-v1";

interface DailyStorage {
  readonly date: string;
  readonly result: DailyResult;
}

function readCache(dateKey: string): DailyResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyStorage;
    if (parsed.date !== dateKey) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function writeCache(dateKey: string, result: DailyResult): void {
  if (typeof window === "undefined") return;
  const payload: DailyStorage = { date: dateKey, result };
  window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(payload));
}

interface DailyWordStorage {
  readonly date: string;
  readonly word: string;
}

// Palabra-pista del día: solo etiqueta el color YA generado por
// buildDailyGridSpec (lib/daily.ts sigue siendo puramente determinista por
// fecha, sin dependencia de red para JUGAR) — se pide una vez por fecha vía
// IA inversa (lib/color-word.ts) y se cachea aparte de DailyStorage, que
// guarda el resultado de la partida, no la pista. Si falla, la pista
// simplemente no aparece — no bloquea nada (ver useDaily más abajo).
function readWordCache(dateKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DAILY_WORD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyWordStorage;
    if (parsed.date !== dateKey) return null;
    return parsed.word;
  } catch {
    return null;
  }
}

function writeWordCache(dateKey: string, word: string): void {
  if (typeof window === "undefined") return;
  const payload: DailyWordStorage = { date: dateKey, word };
  window.localStorage.setItem(DAILY_WORD_STORAGE_KEY, JSON.stringify(payload));
}

export type DailyPhase = "loading" | "playing" | "result";

export interface DailyState {
  readonly phase: DailyPhase;
  readonly gridSpec: GridSpec | null;
  readonly round: Round | null;
  readonly dateKey: string;
}

export type DailyAction =
  | { type: "HYDRATE"; cached: DailyResult | null; gridSpec: GridSpec; dateKey: string }
  | { type: "GUESS"; row: number; col: number }
  | { type: "REQUEST_HINT"; kind: HintKind }
  | { type: "SET_CLUE_WORD"; word: string };

const initialDailyState: DailyState = { phase: "loading", gridSpec: null, round: null, dateKey: "" };

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
  const maxHints = DIFFICULTY[gridSpec.difficulty].maxHints;
  if (round.hints.length >= maxHints) return round;
  if (round.hints.some((h) => h.kind === kind)) return round;
  if (kind === "dir" && round.guesses.length === 0) return round;

  const grid = buildGrid(gridSpec);
  const target = grid.target;
  const n = gridSpec.size - 1 || 1;

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
        // word empieza vacío — placeholder hasta que el efecto de abajo la
        // rellene (vía colorWord + SET_CLUE_WORD) o falle en silencio.
        // Diario.tsx trata word==="" como "sin pista todavía", nunca la
        // pasa a ClueBar/Reveal así.
        clue: { type: "word", word: "", targetHex: action.gridSpec.targetHex },
        gridSpec: action.gridSpec,
        guesses: action.cached?.guesses ?? [],
        hints: action.cached?.hints ?? [],
        status: action.cached?.status ?? "playing",
        score: action.cached?.score ?? null,
      };
      return {
        phase: action.cached ? "result" : "playing",
        gridSpec: action.gridSpec,
        round,
        dateKey: action.dateKey,
      };
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
    case "SET_CLUE_WORD": {
      if (!state.round) return state;
      return { ...state, round: { ...state.round, clue: { ...state.round.clue, word: action.word } } };
    }
    default:
      return state;
  }
}

export function useDaily(): { state: DailyState; dispatch: Dispatch<DailyAction> } {
  const [state, dispatch] = useReducer(dailyReducer, initialDailyState);

  useEffect(() => {
    // localDateKey() se llama UNA sola vez aquí (misma marca de tiempo `now`
    // que arma gridSpec) y se propaga como state.dateKey — evita que una
    // ronda que cruza la medianoche local se guarde bajo la fecha
    // equivocada (ver dateKey en DailyState).
    const now = new Date();
    const dateKey = localDateKey(now);
    const gridSpec = buildDailyGridSpec(now);
    dispatch({ type: "HYDRATE", cached: readCache(dateKey), gridSpec, dateKey });
  }, []);

  useEffect(() => {
    const round = state.round;
    if (state.phase !== "result" || !round || round.status === "playing") return;
    if (readCache(state.dateKey)) return;
    writeCache(state.dateKey, {
      guesses: round.guesses,
      hints: round.hints,
      status: round.status,
      score: round.score ?? 0,
    });
  }, [state.phase, state.round, state.dateKey]);

  // Palabra-pista: no bloquea nada (lib/daily.ts sigue generando el color
  // en puro, sin red) — si falla, round.clue.word se queda en "" y
  // Diario.tsx simplemente no muestra pista, como hasta ahora.
  useEffect(() => {
    const gridSpec = state.gridSpec;
    if (!gridSpec || !state.dateKey || state.round?.clue.word) return;

    const cachedWord = readWordCache(state.dateKey);
    if (cachedWord) {
      dispatch({ type: "SET_CLUE_WORD", word: cachedWord });
      return;
    }

    let cancelled = false;
    colorWord(gridSpec.targetHex).then((result) => {
      if (cancelled || !result.ok) return;
      writeWordCache(state.dateKey, result.word);
      dispatch({ type: "SET_CLUE_WORD", word: result.word });
    });
    return () => {
      cancelled = true;
    };
  }, [state.gridSpec, state.dateKey, state.round?.clue.word]);

  return { state, dispatch };
}
