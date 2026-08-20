import { nanoid } from "nanoid";
import { deltaE } from "./color";
import { buildGrid } from "./grid";
import { DIFFICULTY, MAX_GUESSES } from "./types";
import type { GameAction, GameState, Guess, Player, PlayerId, Round } from "./types";

/**
 * Motor puro: (state, action) => state. Sin React, sin window, sin I/O, sin
 * aleatoriedad sin seed. La derivación de color y el seed llegan ya
 * resueltos en SUBMIT_CLUE.
 */

const RING_POINTS = [100, 60, 30, 12] as const;
const HINT_PENALTY = 15;
const EXTRA_GUESS_PENALTY = 8;

export const initialState: GameState = {
  mode: "solo",
  phase: "home",
  players: [],
  activeIndex: 0,
  config: { size: 4, difficulty: "facil" },
  rounds: [],
  currentRound: null,
  hasPlayed: false,
};

function chebyshev(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function ringPoints(ring: number): number {
  return RING_POINTS[ring] ?? 0;
}

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

export function bestGuess(round: Round): Guess | null {
  if (round.guesses.length === 0) return null;
  return round.guesses.reduce((best, g) => {
    if (g.ring < best.ring) return g;
    if (g.ring === best.ring && g.closeness > best.closeness) return g;
    return best;
  });
}

export function isRoundOver(round: Round): boolean {
  return round.status !== "playing";
}

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

function makePlayer(name: string, accent: Player["accent"]): Player {
  return { id: nanoid(), name, accent };
}

function applyGuess(state: GameState, round: Round, row: number, col: number): GameState {
  if (round.status !== "playing") return state;
  if (round.guesses.some((g) => g.row === row && g.col === col)) return state;

  const grid = buildGrid(round.gridSpec);
  const cell = grid.cells[row]?.[col];
  if (!cell) return state;

  const ring = chebyshev({ row, col }, grid.target);
  const closeness = Math.max(
    0,
    Math.min(1, 1 - deltaE(cell.hex, round.clue.targetHex) / grid.maxDeltaE),
  );
  const guesses = [...round.guesses, { row, col, hex: cell.hex, ring, closeness }];
  const over = ring === 0 || guesses.length >= MAX_GUESSES;

  const status: Round["status"] = over ? (ring === 0 ? "solved" : "failed") : "playing";
  const nextRound: Round = {
    ...round,
    guesses,
    status,
    score: over ? scoreRound({ ...round, guesses, status, score: null }) : null,
  };

  const rounds = state.rounds.map((r) => (r.id === round.id ? nextRound : r));
  return {
    ...state,
    rounds,
    phase: over ? "reveal" : state.phase,
    hasPlayed: over ? true : state.hasPlayed,
  };
}

function applyHint(state: GameState, round: Round, kind: Round["hints"][number]["kind"]): GameState {
  if (round.status !== "playing") return state;
  const maxHints = DIFFICULTY[state.config.difficulty].maxHints;
  if (round.hints.length >= maxHints) return state;
  if (round.hints.some((h) => h.kind === kind)) return state;
  if (kind === "dir" && round.guesses.length === 0) return state;

  const grid = buildGrid(round.gridSpec);
  const target = grid.target;
  const n = state.config.size - 1 || 1;

  let text: string;
  if (kind === "light") {
    const r = target.col / n;
    text = r < 0.34 ? "Oscuro" : r < 0.67 ? "Medio" : "Claro";
  } else if (kind === "sat") {
    const r = (n - target.row) / n;
    text = r < 0.34 ? "Apagado" : r < 0.67 ? "Medio" : "Vivo";
  } else {
    const last = round.guesses[round.guesses.length - 1];
    if (!last) return state;
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

  const nextRound: Round = { ...round, hints: [...round.hints, { kind, text }] };
  const rounds = state.rounds.map((r) => (r.id === round.id ? nextRound : r));
  return { ...state, rounds };
}

function currentRoundOf(state: GameState): Round | null {
  if (state.currentRound === null) return null;
  return state.rounds[state.currentRound] ?? null;
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "START_SOLO": {
      const player = makePlayer("Jugador", "signal");
      return {
        ...state,
        mode: "solo",
        phase: "setup",
        players: [player],
        activeIndex: 0,
        config: action.config,
        rounds: [],
        currentRound: null,
      };
    }

    case "START_DUEL": {
      const [name1, name2] = action.names;
      const players: [Player, Player] = [
        makePlayer(name1.trim() || "J1", "signal"),
        makePlayer(name2.trim() || "J2", "muted"),
      ];
      return {
        ...state,
        mode: "duel",
        phase: "setup",
        players,
        activeIndex: 0,
        rounds: [],
        currentRound: null,
      };
    }

    case "SET_CONFIG": {
      return { ...state, config: { ...state.config, ...action.config } };
    }

    case "SUBMIT_CLUE": {
      const setterIndex = state.activeIndex;
      const setter = state.players[setterIndex];
      if (!setter) return state;

      const isDuel = state.mode === "duel";
      const guesser = isDuel ? state.players[1 - setterIndex] : setter;
      if (!guesser) return state;

      const round: Round = {
        id: nanoid(),
        guesserId: guesser.id,
        setterId: isDuel ? setter.id : null,
        clue: action.clue,
        gridSpec: {
          seed: action.seed,
          size: state.config.size,
          difficulty: state.config.difficulty,
          targetHex: action.clue.targetHex,
        },
        guesses: [],
        hints: [],
        status: "playing",
        score: null,
      };

      const rounds = [...state.rounds, round];
      return {
        ...state,
        rounds,
        currentRound: rounds.length - 1,
        phase: isDuel ? "curtain" : "playing",
        activeIndex: isDuel ? state.players.indexOf(guesser) : setterIndex,
      };
    }

    case "UNLOCK_CURTAIN": {
      if (state.phase !== "curtain") return state;
      return { ...state, phase: "playing" };
    }

    case "GUESS": {
      if (state.phase !== "playing") return state;
      const round = currentRoundOf(state);
      if (!round) return state;
      return applyGuess(state, round, action.row, action.col);
    }

    case "REQUEST_HINT": {
      if (state.phase !== "playing") return state;
      const round = currentRoundOf(state);
      if (!round) return state;
      return applyHint(state, round, action.kind);
    }

    case "NEXT": {
      if (state.phase !== "reveal") return state;

      if (state.mode === "solo") {
        return { ...state, phase: "setup", currentRound: null };
      }

      // Duelo: tras la primera ronda, el que acaba de adivinar pasa a poner
      // la pista de la segunda ronda (PRD §4.8 — cada jugador pone y
      // adivina una vez). Con las dos rondas jugadas, va al marcador.
      if (state.rounds.length < 2) {
        const lastRound = state.rounds[state.rounds.length - 1];
        const nextSetterIndex = lastRound
          ? state.players.findIndex((p) => p.id === lastRound.guesserId)
          : state.activeIndex;
        return {
          ...state,
          phase: "setup",
          currentRound: null,
          activeIndex: nextSetterIndex >= 0 ? nextSetterIndex : state.activeIndex,
        };
      }

      return { ...state, phase: "scoreboard", currentRound: null };
    }

    case "REMATCH": {
      const firstRound = state.rounds[0];
      const previousStarterIndex = firstRound
        ? state.players.findIndex((p) => p.id === firstRound.setterId)
        : 0;
      const nextStarterIndex =
        state.mode === "duel" && previousStarterIndex >= 0 ? 1 - previousStarterIndex : 0;

      return {
        ...state,
        phase: "setup",
        rounds: [],
        currentRound: null,
        activeIndex: nextStarterIndex,
      };
    }

    case "GO_HOME": {
      return { ...initialState, hasPlayed: state.hasPlayed };
    }

    default:
      return state;
  }
}
