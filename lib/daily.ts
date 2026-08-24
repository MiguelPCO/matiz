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
