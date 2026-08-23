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
  /** Desplazamiento uniforme de croma aplicado a toda la carta por encaje de
   * gamut (ver nota junto a su cálculo, más abajo). Expuesto solo para
   * tests: cuanto mayor su magnitud, más se aleja la carta del croma real
   * del objetivo — que nunca se desplaza — y más se delata éste por
   * contraste frente al resto de su fila. */
  readonly shiftC: number;
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

  // El eje L nunca choca con el gamut en sí mismo (croma 0 cabe en cualquier
  // L), pero el HUECO DE CROMA que el gamut deja en las columnas extremas sí
  // depende de cuánto se alejen esas columnas de L0 — y por tanto, de
  // lStep. Antes lStep se fijaba solo por dificultad/tamaño, ciego a C0; si
  // C0 era medianamente saturado, las columnas extremas caían donde el
  // gamut apenas admite croma y todo el ajuste recaía en shiftC (ver más
  // abajo), que arrastra TODA la carta hacia lo apagado mientras la celda
  // objetivo sigue mostrando su hex exacto sin desplazar — se delataba por
  // contraste frente al resto de su fila (ver MATIZ-SPRINTS.md § Deuda
  // técnica conocida).
  //
  // Fix: encoger lStep (nunca bajo MIN_STEP_L) hasta que las columnas
  // extremas, más cerca de L0, dejen hueco de gamut suficiente. El objetivo
  // no es solo C0 — es lo que la fila del objetivo necesita en su extremo
  // más vivo (row=0): C0 + tr*desiredCStep, con desiredCStep calculado
  // ANTES de saber cuánto gamut habrá (es el paso que se querría tener sin
  // restricción). Ese hueco existe siempre en L0 mismo (targetHex es
  // válido), así que basta con acercarse lo suficiente.
  const nominalLStep = Math.max(cfg.spreadL / (size - 1), MIN_STEP_L);
  const desiredCStep = Math.max(cfg.spreadC / (size - 1), MIN_STEP_C);
  const desiredMaxRawC = C0 + tr * desiredCStep;

  function lBoundsFor(lStep: number) {
    const minRawL = L0 - tc * lStep;
    const maxRawL = L0 + (size - 1 - tc) * lStep;
    const shiftL = fitShift(minRawL, maxRawL, L_MIN, L_MAX);
    const lAtCol0 = L0 + (0 - tc) * lStep + shiftL;
    const lAtColLast = L0 + (size - 1 - tc) * lStep + shiftL;
    const gamutCeiling = Math.min(
      maxInGamutChroma(lAtCol0, H, C_MAX),
      maxInGamutChroma(lAtColLast, H, C_MAX),
    );
    return { shiftL, lAtCol0, lAtColLast, gamutCeiling };
  }

  let lStep = nominalLStep;
  let lBounds = lBoundsFor(lStep);

  if (lBounds.gamutCeiling < desiredMaxRawC) {
    let lo = MIN_STEP_L;
    let loBounds = lBoundsFor(lo);
    if (loBounds.gamutCeiling >= desiredMaxRawC) {
      let hi = lStep;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const midBounds = lBoundsFor(mid);
        if (midBounds.gamutCeiling >= desiredMaxRawC) {
          lo = mid;
          loBounds = midBounds;
        } else {
          hi = mid;
        }
      }
    }
    // Si ni MIN_STEP_L basta (target ya casi en el borde del gamut, o
    // demasiadas filas de margen hasta row=0), queda el mejor esfuerzo — el
    // residuo restante lo absorbe shiftC/cStep como antes, ahora partiendo
    // de un hueco de gamut mayor.
    lStep = lo;
    lBounds = loBounds;
  }

  const { shiftL, gamutCeiling } = lBounds;
  const availableRange = Math.max(0, gamutCeiling - C_MIN);
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

  return { size, H, lStep, cStep, shiftC, target: { row: tr, col: tc }, cells };
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
