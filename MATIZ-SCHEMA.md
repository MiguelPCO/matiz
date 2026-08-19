# MATIZ — SCHEMA v1.0

> Modelo de datos, contratos de módulos y estructura del proyecto.
> Documento vinculante: el código debe corresponderse con esto.

---

## 1. Principios del modelo

Cuatro reglas que gobiernan todo lo demás. Vienen de la decisión «hotseat ahora, online sin reescritura»:

1. **El estado canónico es JSON puro.** Nada de refs, closures, funciones, `Map`, `Set` ni instancias de clase dentro del estado. Si no sobrevive a `JSON.stringify` → `JSON.parse`, no pertenece al estado.
2. **El motor es puro.** `lib/engine.ts` no importa React, no toca `window`, no genera aleatoriedad sin seed y no muta sus argumentos. Entrada: `(state, action)`. Salida: `state` nuevo.
3. **Los jugadores son un array con `id`.** Nunca «jugador 1 / jugador 2» hardcodeado. El turno es un `playerId`.
4. **La carta es derivable, no almacenada.** Se guarda la semilla y los parámetros; la rejilla se reconstruye determinísticamente. Esto es lo que hará barato el online.

---

## 2. Tipos base

```typescript
// ---------- Color ----------

/** Formato canónico del proyecto. */
export interface Oklch {
  L: number;  // 0–1
  C: number;  // 0–~0.37
  H: number;  // 0–360
}

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** Siempre en formato #rrggbb, minúsculas. */
export type Hex = string;

// ---------- Identificadores ----------

export type PlayerId = string;   // nanoid
export type RoundId = string;    // nanoid
export type Seed = number;       // entero de 32 bits
```

---

## 3. Configuración de partida

```typescript
export type GameMode = 'solo' | 'duel';
export type ClueType = 'word' | 'image';
export type GridSize = 4 | 5 | 6 | 8;
export type Difficulty = 'facil' | 'medio' | 'dificil';

export interface DifficultyConfig {
  readonly label: string;
  readonly spreadL: number;   // dispersión total de luminosidad en la carta
  readonly spreadC: number;   // dispersión total de croma
  readonly maxHints: number;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyConfig>> = {
  facil:   { label: 'Fácil',   spreadL: 0.62, spreadC: 0.20, maxHints: 3 },
  medio:   { label: 'Medio',   spreadL: 0.42, spreadC: 0.13, maxHints: 2 },
  dificil: { label: 'Difícil', spreadL: 0.26, spreadC: 0.08, maxHints: 1 },
} as const;

/** Suelo de decidibilidad en luminosidad: difícil de DECIDIR, no imposible de VER. Constante. */
export const MIN_STEP_L = 0.045;

/**
 * Paso de croma NOMINAL, no constante dura. Cerca de blanco o negro el gamut
 * sRGB no siempre admite 0.014 de croma — buildGrid lo usa como objetivo y
 * lo reduce por carta a lo que el gamut real permita, sin bajar de
 * ABSOLUTE_MIN_STEP_C.
 */
export const MIN_STEP_C = 0.014;

/** Suelo absoluto de croma — por debajo, ni el gamut ni la cuantización de 8 bits del hex garantizan que dos celdas se vean distintas. */
export const ABSOLUTE_MIN_STEP_C = 0.006;

export const MAX_GUESSES = 3;

export interface RoundConfig {
  readonly size: GridSize;
  readonly difficulty: Difficulty;
}
```

---

## 4. Pista y carta

```typescript
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
```

**Contrato de determinismo:** `buildGrid(spec)` con la misma `GridSpec` devuelve siempre una `Grid` idéntica. Test obligatorio.

---

## 5. Jugada, pistas y ronda

```typescript
export interface Guess {
  readonly row: number;
  readonly col: number;
  readonly hex: Hex;
  /** Distancia Chebyshev al objetivo. Determina la puntuación base. */
  readonly ring: number;
  /** Cercanía perceptual normalizada, 0–1. Alimenta el termómetro. */
  readonly closeness: number;
}

export type HintKind = 'light' | 'sat' | 'dir';

export interface Hint {
  readonly kind: HintKind;
  /** Texto ya resuelto, listo para mostrar. */
  readonly text: string;
}

export type RoundStatus = 'playing' | 'solved' | 'failed';

export interface Round {
  readonly id: RoundId;
  /** Quién adivina. */
  readonly guesserId: PlayerId;
  /** Quién puso la pista. null en modo solo. */
  readonly setterId: PlayerId | null;
  readonly clue: Clue;
  readonly gridSpec: GridSpec;
  readonly guesses: readonly Guess[];   // máx MAX_GUESSES
  readonly hints: readonly Hint[];      // máx DIFFICULTY[d].maxHints
  readonly status: RoundStatus;
  /** null mientras status === 'playing'. */
  readonly score: number | null;
}
```

---

## 6. Estado global

```typescript
export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  /** Token de identidad, NUNCA de la paleta de las cartas. */
  readonly accent: 'signal' | 'muted';
}

export type Phase =
  | 'home'
  | 'setup'
  | 'curtain'
  | 'playing'
  | 'reveal'
  | 'scoreboard';

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
```

**Invariantes** (verificables en test):

- `activeIndex` siempre `>= 0` y `< players.length`
- `mode === 'solo'` ⟹ `players.length === 1` y todo `setterId === null`
- `mode === 'duel'` ⟹ `players.length === 2` y `setterId !== guesserId`
- `guesses.length <= MAX_GUESSES`
- `hints.length <= DIFFICULTY[config.difficulty].maxHints`
- `status === 'playing'` ⟺ `score === null`
- El estado completo sobrevive a un ciclo `JSON.stringify` / `parse` sin pérdida

---

## 7. Acciones del motor

```typescript
export type GameAction =
  | { type: 'START_SOLO'; config: RoundConfig }
  | { type: 'START_DUEL'; names: [string, string] }
  | { type: 'SET_CONFIG'; config: Partial<RoundConfig> }
  | { type: 'SUBMIT_CLUE'; clue: Clue; seed: Seed }
  | { type: 'UNLOCK_CURTAIN' }
  | { type: 'GUESS'; row: number; col: number }
  | { type: 'REQUEST_HINT'; kind: HintKind }
  | { type: 'NEXT' }        // avanza reveal → siguiente turno o marcador
  | { type: 'REMATCH' }
  | { type: 'GO_HOME' };

export function reducer(state: GameState, action: GameAction): GameState;
```

**Regla:** el reducer nunca hace I/O. La derivación del color (API o canvas) ocurre **antes**, en la capa de UI, y llega ya resuelta dentro de `SUBMIT_CLUE`. El `seed` también se genera fuera y se pasa como dato — así el reducer permanece determinista.

### Transiciones de fase

```
home ──START_SOLO──▶ setup ──SUBMIT_CLUE──▶ playing
home ──START_DUEL──▶ setup ──SUBMIT_CLUE──▶ curtain ──UNLOCK──▶ playing

playing ──GUESS (ring 0 | 3er tiro)──▶ reveal

reveal ──NEXT──▶ setup        (solo · o duelo con rondas pendientes)
reveal ──NEXT──▶ scoreboard   (duelo completo)

scoreboard ──REMATCH──▶ setup
*        ──GO_HOME──▶ home
```

---

## 8. Contratos de módulos

### `lib/color.ts` — puro, sin dependencias

```typescript
export function hexToRgb(hex: Hex): { r: number; g: number; b: number };
export function rgbToHex(r: number, g: number, b: number): Hex;
export function rgbToOklab(r: number, g: number, b: number): Oklab;
export function oklabToRgb(L: number, a: number, b: number): { r: number; g: number; b: number };
export function oklabToOklch(lab: Oklab): Oklch;
export function oklchToHex(c: Oklch): Hex;
export function hexToOklch(hex: Hex): Oklch;

/** Distancia euclídea en OKLab. Base del termómetro. */
export function deltaE(a: Hex, b: Hex): number;
```

### `lib/grid.ts` — determinista

```typescript
/** PRNG con seed (mulberry32). Mismo seed ⟹ misma secuencia. */
export function rng(seed: Seed): () => number;

/**
 * Carta de tonalidades del MISMO tono.
 * Eje X (col): luminosidad, oscuro → claro.
 * Eje Y (row): croma, vivo (arriba) → apagado (abajo).
 * Respeta MIN_STEP_L (constante) y el paso de croma nominal MIN_STEP_C,
 * reducido por carta al gamut sRGB real disponible cuando no cabe entero —
 * nunca por debajo de ABSOLUTE_MIN_STEP_C.
 */
export function buildGrid(spec: GridSpec): Grid;
```

### `lib/engine.ts` — puro

```typescript
export const initialState: GameState;
export function reducer(state: GameState, action: GameAction): GameState;

// Selectores derivados — sin estado propio
export function bestGuess(round: Round): Guess | null;
export function scoreRound(round: Round): number;
export function isRoundOver(round: Round): boolean;
export function winner(state: GameState): PlayerId | null;
```

**Puntuación:**

```typescript
const RING_POINTS = [100, 60, 30, 12] as const;  // índice = ring; ≥4 → 0
const HINT_PENALTY = 15;
const EXTRA_GUESS_PENALTY = 8;

score = max(0, RING_POINTS[bestRing] ?? 0
              - hints.length * HINT_PENALTY
              - max(0, guesses.length - 1) * EXTRA_GUESS_PENALTY);
```

**Desempate** (`winner`), por orden: más puntos → menos pistas → menos tiros → menor ΔE del mejor tiro.

### `lib/thermo.ts`

```typescript
export interface ThermoReading {
  readonly label: 'Lejos' | 'Templado' | 'Cerca' | 'Casi' | '¡Ahí es!';
  readonly pct: number;   // 0–100, ancho de la barra
}

export function readThermo(closeness: number): ThermoReading;
```

Umbrales validados en prototipo: `≥0.965` ¡Ahí es! · `≥0.82` Casi · `≥0.55` Cerca · `≥0.30` Templado · resto Lejos.

### `lib/extract.ts` — cliente, requiere DOM

```typescript
/**
 * Color representativo de una imagen.
 * Media en luz lineal ponderada por croma: el sujeto pesa más que el fondo.
 */
export function extractColor(img: HTMLImageElement): Hex;
```

### `lib/word-color.ts` — red

```typescript
export type WordColorResult =
  | { ok: true; hex: Hex; cached: boolean }
  | { ok: false; reason: 'network' | 'invalid' | 'timeout' };

export async function wordToColor(word: string): Promise<WordColorResult>;
```

Nunca lanza excepción: devuelve el resultado tipado para que la UI ofrezca siempre una salida. Caché en memoria por término normalizado.

### `lib/gsap.ts`

```typescript
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
// Registro ÚNICO de plugins en todo el proyecto.
export { gsap, useGSAP };
export const prefersReducedMotion = (): boolean => /* matchMedia */;
```

---

## 9. Estructura de archivos

```
matiz/
├── app/
│   ├── layout.tsx              # fuentes, metadata, providers
│   ├── page.tsx                # host del juego (una sola ruta)
│   └── globals.css             # @theme de Tailwind v4
├── components/
│   ├── screens/
│   │   ├── Home.tsx            # S0
│   │   ├── Setup.tsx           # S1
│   │   ├── Curtain.tsx         # S2
│   │   ├── Play.tsx            # S3
│   │   ├── Reveal.tsx          # S4
│   │   ├── Scoreboard.tsx      # S5
│   │   └── HowToPlay.tsx       # S6
│   ├── game/
│   │   ├── ColorCard.tsx       # carta + swatches + ejes + línea de reveal
│   │   ├── Swatch.tsx
│   │   ├── Thermometer.tsx
│   │   ├── ClueBar.tsx         # B/N → color
│   │   ├── HintRow.tsx
│   │   └── ScorePanel.tsx
│   └── ui/
│       ├── Segmented.tsx       # selector de opciones
│       ├── Button.tsx
│       ├── Label.tsx           # micro-label mono
│       └── HoldToConfirm.tsx   # anillo de mantener-pulsado
├── lib/
│   ├── color.ts   ├── grid.ts    ├── engine.ts
│   ├── thermo.ts  ├── extract.ts ├── word-color.ts
│   ├── gsap.ts    └── types.ts
├── hooks/
│   ├── useGame.ts              # useReducer + contexto
│   └── useHaptics.ts
└── tokens/
    └── theme.css               # rampa OKLCH
```

**Una sola ruta.** El juego es modal por naturaleza; la fase vive en el estado, no en la URL. Decisión consciente: no hay deep-link a una partida en curso, y no debe haberlo.

---

## 10. Tokens

`tokens/theme.css` — Tailwind v4, CSS-first:

```css
@theme {
  /* Rampa neutra — C ≈ 0.006, H ≈ 255. No debe sesgar la lectura del color. */
  --color-surface-0:  oklch(0.180 0.006 255);   /* #14161A */
  --color-surface-1:  oklch(0.235 0.006 255);   /* #1E2024 */
  --color-surface-2:  oklch(0.295 0.006 255);   /* #292C31 */
  --color-line:       oklch(0.360 0.007 255);   /* #383C43 */
  --color-text-faint: oklch(0.520 0.012 255);   /* #666D77 */
  --color-text-muted: oklch(0.700 0.016 255);   /* #98A0AB */
  --color-text:       oklch(0.930 0.005 255);   /* #ECEEF1 */

  /* Acento único — safelight. Solo señal. */
  --color-signal:     oklch(0.750 0.130 68);    /* #E7A34B */
  --color-signal-ink: oklch(0.220 0.045 60);    /* texto sobre ámbar */

  --font-sans: 'General Sans', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;

  --radius-swatch: 3px;
  --radius-panel: 12px;
  --radius-frame: 14px;
}
```

**Los hex son de referencia; el valor canónico es OKLCH.** Se computan con el script de Python del workspace, como en LOOP CLUB.

**Prohibido en tokens:** verde de éxito, rojo de error. No existen en este sistema. El único feedback cromático es el termómetro.

---

## 11. Testing mínimo

No es un proyecto con TDD, pero cuatro cosas deben tener test porque un fallo silencioso ahí arruina la partida:

| Test | Qué verifica |
|---|---|
| `color.roundtrip` | `hex → oklch → hex` estable en toda la rampa |
| `grid.deterministic` | Mismo `GridSpec` ⟹ misma `Grid`, 100 seeds |
| `grid.minStep` | Ningún par de vecinos por debajo de los suelos, en las 3 dificultades × 4 tamaños |
| `engine.invariants` | Las invariantes de §6 se mantienen tras cualquier secuencia de acciones |
| `engine.serializable` | `parse(stringify(state))` es igual al original |
