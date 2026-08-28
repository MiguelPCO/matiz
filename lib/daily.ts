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

/** Un DailyResult por fecha jugada — historial completo, no solo el último día (hooks/useDaily.ts). */
export type DailyHistory = Readonly<Record<string, DailyResult>>;

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function addDays(key: string, delta: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + delta);
  return localDateKey(date);
}

export interface DailyStats {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly winPercent: number;
  readonly currentStreak: number;
  readonly bestStreak: number;
}

/**
 * Racha actual mirando hacia atrás desde hoy: fallar hoy la corta a 0 de
 * inmediato; no haber jugado hoy todavía NO la corta (se sigue contando
 * desde ayer) — un hueco (día sin entrada) en el pasado sí la corta, ahí.
 */
function currentStreakOf(history: DailyHistory, todayKey: string): number {
  const today = history[todayKey];
  if (today?.status === "failed") return 0;

  let streak = today?.status === "solved" ? 1 : 0;
  let cursor = addDays(todayKey, -1);
  while (history[cursor]?.status === "solved") {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Mejor racha histórica: recorre el historial en orden cronológico, exige días de calendario consecutivos (no solo entradas consecutivas — un hueco corta la racha aunque no haya entrada "fallada" ahí). */
function bestStreakOf(history: DailyHistory): number {
  const keys = Object.keys(history).sort();
  let best = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const key of keys) {
    if (history[key]?.status !== "solved") {
      run = 0;
      prevKey = key;
      continue;
    }
    const contiguous = prevKey !== null && addDays(prevKey, 1) === key;
    run = contiguous ? run + 1 : 1;
    best = Math.max(best, run);
    prevKey = key;
  }
  return best;
}

export function computeDailyStats(history: DailyHistory, todayKey: string): DailyStats {
  const entries = Object.values(history);
  const gamesPlayed = entries.length;
  const wins = entries.filter((e) => e.status === "solved").length;
  const winPercent = gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100);

  return {
    gamesPlayed,
    wins,
    winPercent,
    currentStreak: currentStreakOf(history, todayKey),
    bestStreak: bestStreakOf(history),
  };
}

const RING_EMOJI = ["🟩", "🟨", "🟧"] as const;

export function buildShareText(dateKey: string, result: DailyResult): string {
  const symbols = result.guesses.map((g) => RING_EMOJI[g.ring] ?? "⬜").join("");
  const hintsLabel = result.hints.length === 1 ? "1 pista" : `${result.hints.length} pistas`;
  return `MATIZ ${dateKey}\n${symbols}\n${result.score} pts, ${hintsLabel}`;
}
