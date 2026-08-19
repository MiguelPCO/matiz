// ---------- Color ----------

/** Formato canónico del proyecto. */
export interface Oklch {
  L: number; // 0–1
  C: number; // 0–~0.37
  H: number; // 0–360
}

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** Siempre en formato #rrggbb, minúsculas. */
export type Hex = string;

// ---------- Identificadores ----------

export type PlayerId = string; // nanoid
export type RoundId = string; // nanoid
export type Seed = number; // entero de 32 bits

// ---------- Configuración de partida ----------

export type GameMode = "solo" | "duel";
export type ClueType = "word" | "image";
export type GridSize = 4 | 5 | 6 | 8;
export type Difficulty = "facil" | "medio" | "dificil";

export interface DifficultyConfig {
  readonly label: string;
  readonly spreadL: number; // dispersión total de luminosidad en la carta
  readonly spreadC: number; // dispersión total de croma
  readonly maxHints: number;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyConfig>> = {
  facil: { label: "Fácil", spreadL: 0.62, spreadC: 0.2, maxHints: 3 },
  medio: { label: "Medio", spreadL: 0.42, spreadC: 0.13, maxHints: 2 },
  dificil: { label: "Difícil", spreadL: 0.26, spreadC: 0.08, maxHints: 1 },
} as const;

/** Suelo de decidibilidad en luminosidad: difícil de DECIDIR, no imposible de VER. Constante — el eje L nunca choca con el gamut sRGB (croma 0 cabe en cualquier L). */
export const MIN_STEP_L = 0.045;

/**
 * Paso de croma nominal entre celdas vecinas. NO es una constante dura: cerca
 * de blanco o negro puros el gamut sRGB no siempre admite 0.014 de croma, así
 * que buildGrid la usa como objetivo y la reduce por carta hasta lo que el
 * gamut real permita en las columnas más extremas — nunca por debajo de
 * ABSOLUTE_MIN_STEP_C. Ver buildGridLattice en grid.ts.
 */
export const MIN_STEP_C = 0.014;

/**
 * Suelo absoluto de croma, por debajo de MIN_STEP_C. Solo se toca cuando ni
 * el gamut da para el nominal — evita perseguir decidibilidad donde no cabe
 * físicamente. Por debajo de esto la diferencia deja de ser fiable incluso
 * en la matemática OKLCH continua, antes de la cuantización de 8 bits del
 * hex de salida.
 */
export const ABSOLUTE_MIN_STEP_C = 0.006;

export const MAX_GUESSES = 3;

export interface RoundConfig {
  readonly size: GridSize;
  readonly difficulty: Difficulty;
}

// ---------- Pista y carta ----------

export interface Clue {
  readonly type: ClueType;
  /** Presente si type === 'word'. */
  readonly word?: string;
  /** Presente si type === 'image'. dataURL — serializable. */
  readonly imageSrc?: string;
  /** Color derivado de la pista. Nunca se muestra hasta el reveal. */
  readonly targetHex: Hex;
}

export interface Cell {
  readonly row: number;
  readonly col: number;
  readonly hex: Hex;
}

export interface GridSpec {
  readonly seed: Seed;
  readonly size: GridSize;
  readonly difficulty: Difficulty;
  readonly targetHex: Hex;
}

/** Derivado — NO se almacena en el estado. Se reconstruye desde GridSpec. */
export interface Grid {
  readonly size: GridSize;
  readonly cells: readonly (readonly Cell[])[];
  readonly target: { readonly row: number; readonly col: number };
  /** ΔE máximo de la carta al objetivo. Normaliza el termómetro. */
  readonly maxDeltaE: number;
}

// ---------- Jugada, pistas y ronda ----------

export interface Guess {
  readonly row: number;
  readonly col: number;
  readonly hex: Hex;
  /** Distancia Chebyshev al objetivo. Determina la puntuación base. */
  readonly ring: number;
  /** Cercanía perceptual normalizada, 0–1. Alimenta el termómetro. */
  readonly closeness: number;
}

export type HintKind = "light" | "sat" | "dir";

export interface Hint {
  readonly kind: HintKind;
  /** Texto ya resuelto, listo para mostrar. */
  readonly text: string;
}

export type RoundStatus = "playing" | "solved" | "failed";

export interface Round {
  readonly id: RoundId;
  /** Quién adivina. */
  readonly guesserId: PlayerId;
  /** Quién puso la pista. null en modo solo. */
  readonly setterId: PlayerId | null;
  readonly clue: Clue;
  readonly gridSpec: GridSpec;
  readonly guesses: readonly Guess[]; // máx MAX_GUESSES
  readonly hints: readonly Hint[]; // máx DIFFICULTY[d].maxHints
  readonly status: RoundStatus;
  /** null mientras status === 'playing'. */
  readonly score: number | null;
}

// ---------- Estado global ----------

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  /** Token de identidad, NUNCA de la paleta de las cartas. */
  readonly accent: "signal" | "muted";
}

export type Phase = "home" | "setup" | "curtain" | "playing" | "reveal" | "scoreboard";

export interface GameState {
  readonly mode: GameMode;
  readonly phase: Phase;
  readonly players: readonly Player[];
  /** Índice en players. Quién tiene el móvil ahora. */
  readonly activeIndex: number;
  readonly config: RoundConfig;
  readonly rounds: readonly Round[];
  /** Índice de la ronda en curso dentro de rounds. null fuera de partida. */
  readonly currentRound: number | null;
  /** Marca si ya se jugó alguna partida — la primera es la más fácil. */
  readonly hasPlayed: boolean;
}

// ---------- Acciones del motor ----------

export type GameAction =
  | { type: "START_SOLO"; config: RoundConfig }
  | { type: "START_DUEL"; names: [string, string] }
  | { type: "SET_CONFIG"; config: Partial<RoundConfig> }
  | { type: "SUBMIT_CLUE"; clue: Clue; seed: Seed }
  | { type: "UNLOCK_CURTAIN" }
  | { type: "GUESS"; row: number; col: number }
  | { type: "REQUEST_HINT"; kind: HintKind }
  | { type: "NEXT" } // avanza reveal → siguiente turno o marcador
  | { type: "REMATCH" }
  | { type: "GO_HOME" };
