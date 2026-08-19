import { deltaE, hexToOklch, maxInGamutChroma, oklchToHex } from "./color";
import { ABSOLUTE_MIN_STEP_C, DIFFICULTY, MIN_STEP_C, MIN_STEP_L } from "./types";
import type { Cell, Grid, GridSize, GridSpec, Seed } from "./types";

/**
 * Carta de tonalidades del MISMO tono (H fijo).
 * Eje X (col): luminosidad, oscuro → claro.
 * Eje Y (row): croma, vivo (arriba) → apagado (abajo).
 * Determinista: misma GridSpec ⟹ misma Grid.
 */

const L_MIN = 0.18;
const L_MAX = 0.95;
const C_MIN = 0.01;
const C_MAX = 0.37;

/** PRNG con seed (mulberry32). Mismo seed ⟹ misma secuencia. */
export function rng(seed: Seed): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Traslada un rango [min, max] al interior de [lo, hi] sin alterar su
 * anchura. Evita el colapso de vecinos que produciría un clamp por celda.
 * Precondición (garantizada por DIFFICULTY y los suelos de decidibilidad):
 * (max - min) <= (hi - lo).
 *
 * Límite conocido (eje L únicamente — el eje C se corrige aparte, ver
 * buildGridLattice): la celda objetivo siempre muestra targetHex exacto (PRD
 * §4.3), sin desplazar. Cuando shiftL es distinto de cero — targetHex muy
 * cerca de L_MIN/L_MAX combinado con una posición de celda desfavorable — el
 * paso entre la celda objetivo y su vecino inmediato en L puede, en teoría,
 * caer por debajo de MIN_STEP_L aunque el resto de la carta mantenga el paso
 * exacto (el shift es uniforme: solo afecta al borde con la celda objetivo,
 * nunca a pares de celdas no-objetivo entre sí).
 */
function fitShift(min: number, max: number, lo: number, hi: number): number {
  if (min < lo) return lo - min;
  if (max > hi) return hi - max;
  return 0;
}

export interface GridLatticeCell {
  readonly row: number;
  readonly col: number;
  readonly L: number;
  readonly C: number;
}

/**
 * La matemática continua (pre-hex, pre-gamut-por-celda) detrás de una Grid.
 * Solo para tests: sobre estos valores, lStep/cStep son exactos por
 * construcción — es lo que hace comprobable el suelo de decidibilidad sin el
 * ruido de cuantización de 8 bits que introduce Cell.hex (ver MIN_STEP_C:
 * a menudo es más pequeño que ese ruido, así que no es medible sobre hex).
 */
export interface GridLattice {
  readonly size: GridSize;
  readonly H: number;
  readonly lStep: number;
  readonly cStep: number;
  readonly target: { readonly row: number; readonly col: number };
  readonly cells: readonly (readonly GridLatticeCell[])[];
}

export function buildGridLattice(spec: GridSpec): GridLattice {
  const { size, difficulty, targetHex, seed } = spec;
  const next = rng(seed);
  const tr = Math.floor(next() * size);
  const tc = Math.floor(next() * size);

  const { L: L0, C: C0, H } = hexToOklch(targetHex);
  const cfg = DIFFICULTY[difficulty];

  const lStep = Math.max(cfg.spreadL / (size - 1), MIN_STEP_L);

  const minRawL = L0 - tc * lStep;
  const maxRawL = L0 + (size - 1 - tc) * lStep;
  const shiftL = fitShift(minRawL, maxRawL, L_MIN, L_MAX);

  const lAtCol0 = L0 + (0 - tc) * lStep + shiftL;
  const lAtColLast = L0 + (size - 1 - tc) * lStep + shiftL;

  // El eje L nunca choca con el gamut (croma 0 cabe en cualquier L), pero el
  // eje C sí: cerca de blanco o negro el gamut sRGB apenas admite croma.
  // MIN_STEP_C es un paso NOMINAL, no una constante dura (ver types.ts): se
  // usa como objetivo, pero se reduce por carta al hueco de gamut real
  // disponible en las dos columnas más extremas cuando no cabe entero — sin
  // bajar nunca de ABSOLUTE_MIN_STEP_C. Por debajo de eso (target
  // prácticamente acromático) no hay ajuste que lo resuelva; la salvaguarda
  // por celda de oklchToHex (toInGamutOklab) absorbe lo que aún no quepa.
  //
  // DEUDA CONOCIDA (sin resolver, ver MATIZ-SPRINTS.md § Deuda técnica
  // conocida): cuando C0 (croma del target) supera el gamut disponible en
  // las columnas extremas, shiftC arrastra TODA la fila del objetivo lejos
  // de C0 — pero la celda objetivo sigue mostrando su hex exacto sin
  // desplazar (más abajo, en buildGrid), así que se delata por contraste
  // frente al resto de su fila. Ya se intentó fijar la fila del objetivo sin
  // ese shift; empeora mucho más (colisiones entre filas vecinas se
  // disparan de 110/2400 a >3000/2400) porque haría falta que el eje L
  // también respetara el gamut, no solo el paso de C — cambio de fondo, no
  // un ajuste local.
  const gamutCeiling = Math.min(
    maxInGamutChroma(lAtCol0, H, C_MAX),
    maxInGamutChroma(lAtColLast, H, C_MAX),
  );
  const availableRange = Math.max(0, gamutCeiling - C_MIN);
  const desiredCStep = Math.max(cfg.spreadC / (size - 1), MIN_STEP_C);
  const affordableCStep = availableRange / (size - 1);
  const cStep = Math.max(ABSOLUTE_MIN_STEP_C, Math.min(desiredCStep, affordableCStep));

  // El croma tampoco puede bajar de C_MIN (fila apagado, row=size-1, igual
  // en toda columna). Un shiftC uniforme conserva cStep exacto en toda la
  // carta (nunca colapsa dos filas distintas al mismo borde).
  const minRawC = C0 - (size - 1 - tr) * cStep;
  const maxRawC = C0 + tr * cStep;
  const shiftCLowerBound = C_MIN - minRawC;
  const neededGamutShift = Math.min(0, gamutCeiling - maxRawC);
  const shiftC = Math.max(shiftCLowerBound, neededGamutShift);

  const cells: GridLatticeCell[][] = [];
  for (let row = 0; row < size; row++) {
    const line: GridLatticeCell[] = [];
    for (let col = 0; col < size; col++) {
      const L = L0 + (col - tc) * lStep + shiftL;
      const C = Math.max(C_MIN, C0 + (tr - row) * cStep + shiftC);
      line.push({ row, col, L, C });
    }
    cells.push(line);
  }

  return { size, H, lStep, cStep, target: { row: tr, col: tc }, cells };
}

export function buildGrid(spec: GridSpec): Grid {
  const lattice = buildGridLattice(spec);
  const { size, H, target } = lattice;

  const cells: Cell[][] = lattice.cells.map((row) =>
    row.map((lc) => {
      if (lc.row === target.row && lc.col === target.col) {
        return { row: lc.row, col: lc.col, hex: spec.targetHex };
      }
      return { row: lc.row, col: lc.col, hex: oklchToHex({ L: lc.L, C: lc.C, H }) };
    }),
  );

  const maxDeltaE =
    Math.max(...cells.flat().map((cell) => deltaE(cell.hex, spec.targetHex))) || 1;

  return { size, cells, target, maxDeltaE };
}
