import { describe, expect, it } from "vitest";
import { deltaE, hexToOklch } from "./color";
import { buildGrid, buildGridLattice, findFeasiblePositions } from "./grid";
import { ABSOLUTE_MIN_STEP_C, DIFFICULTY, MIN_STEP_C, MIN_STEP_L } from "./types";
import type { Difficulty, GridSize, GridSpec } from "./types";

const SIZES: readonly GridSize[] = [4, 5, 6, 8];
const DIFFICULTIES: readonly Difficulty[] = ["facil", "medio", "dificil"];

// Colores representativos del rango real de targetHex (extracción de imagen
// o IA de palabra): saturados y neutros, claros y oscuros.
const SAMPLE_TARGETS = [
  "#e7a34b", // ámbar de marca
  "#4a72c9", // azul moderado
  "#b6534f", // rojo ladrillo
  "#3f8f5f", // verde bosque
  "#7d69a8", // violeta moderado
  "#d1c65f", // mostaza
  "#6a5f52", // taupe oscuro muy desaturado
  "#c7bfae", // piedra clara muy desaturada
  "#1f3a5f", // azul marino oscuro
  "#f2d9a6", // beige muy claro
] as const;

function specsFor(difficulty: Difficulty, size: GridSize, seed: number): GridSpec {
  const targetHex = SAMPLE_TARGETS[seed % SAMPLE_TARGETS.length] ?? SAMPLE_TARGETS[0];
  return { seed, size, difficulty, targetHex };
}

describe("grid.deterministic", () => {
  it("misma GridSpec produce siempre la misma Grid, en 100 seeds", () => {
    for (let seed = 0; seed < 100; seed++) {
      const spec = specsFor("medio", 6, seed);
      const a = buildGrid(spec);
      const b = buildGrid(spec);
      expect(b).toEqual(a);
    }
  });
});

describe("grid.minStep", () => {
  it("lStep nunca baja de MIN_STEP_L; cStep nunca baja de ABSOLUTE_MIN_STEP_C (nominal MIN_STEP_C cuando el gamut lo permite)", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const size of SIZES) {
        for (let seed = 0; seed < 20; seed++) {
          const spec = specsFor(difficulty, size, seed);
          const { lStep, cStep } = buildGridLattice(spec);
          expect(lStep).toBeGreaterThanOrEqual(MIN_STEP_L);
          expect(cStep).toBeGreaterThanOrEqual(ABSOLUTE_MIN_STEP_C);
        }
      }
    }
  });

  it("el paso entre celdas vecinas del lattice es uniforme y exacto, en 3 dificultades x 4 tamaños x 50 seeds", () => {
    for (const difficulty of DIFFICULTIES) {
      for (const size of SIZES) {
        for (let seed = 0; seed < 50; seed++) {
          const spec = specsFor(difficulty, size, seed);
          const { cells, lStep, cStep } = buildGridLattice(spec);

          for (let row = 0; row < size; row++) {
            for (let col = 0; col < size - 1; col++) {
              const a = cells[row]?.[col];
              const b = cells[row]?.[col + 1];
              if (!a || !b) continue;
              expect(Math.abs(b.L - a.L)).toBeCloseTo(lStep, 10);
            }
          }
          for (let row = 0; row < size - 1; row++) {
            for (let col = 0; col < size; col++) {
              const a = cells[row]?.[col];
              const b = cells[row + 1]?.[col];
              if (!a || !b) continue;
              // La fila apagado puede quedar recortada por el suelo C_MIN,
              // rompiendo el paso uniforme justo ahí — ver Math.max(C_MIN,…)
              // en buildGridLattice.
              if (a.C <= MIN_STEP_C || b.C <= MIN_STEP_C) continue;
              expect(Math.abs(b.C - a.C)).toBeCloseTo(cStep, 10);
            }
          }
        }
      }
    }
  });

  it("DIFFICULTY define maxHints y spreads coherentes con MAX_GUESSES", () => {
    for (const difficulty of DIFFICULTIES) {
      expect(DIFFICULTY[difficulty].maxHints).toBeGreaterThan(0);
      expect(DIFFICULTY[difficulty].spreadL).toBeGreaterThan(0);
      expect(DIFFICULTY[difficulty].spreadC).toBeGreaterThan(0);
    }
  });
});

// Resuelto (Sprint 1): MIN_STEP_C pasó de suelo duro a paso nominal —
// buildGridLattice lo reduce por carta al gamut sRGB real disponible en las
// columnas más extremas, sin bajar de ABSOLUTE_MIN_STEP_C (types.ts). Antes
// de esto: 807/2400 colisiones medidas sobre las 12 combinaciones (peor en
// facil/8: 268, mejor en dificil/4: 2) — ver historial de Sprint 1.
//
// Queda un residuo irreducible por diseño: ABSOLUTE_MIN_STEP_C es un suelo
// duro (a diferencia de MIN_STEP_C) — cuando el gamut real da menos que eso,
// algo tiene que ceder, y es el paso, no el suelo. Medido: 110/2400
// colisiones, predominantemente en la columna más extrema (col=0 o
// col=size-1, donde vive el gamut más restrictivo). Cero en size=4 en las 3
// dificultades; crece con el tamaño (más columnas llegan cerca del extremo)
// y con spreadC (facil 49/6/15/0 > medio 21/6/4/0 > dificil 7/2/0/0,
// tamaños 8/6/5/4). Se acota el total en vez de exigir cero, para no
// esconder una regresión real (un salto brusco en el conteo) detrás de un
// número que se ajusta hasta que el sample de turno pasa.
const MAX_ACCEPTABLE_VIOLATIONS = 130;

// Parcialmente mejorado (ver MATIZ-SPRINTS.md § Deuda técnica conocida) —
// PERO NO RESUELTO para el caso insignia del debt note. Antes, lStep se
// fijaba solo por dificultad/tamaño, ciego a C0 — así que shiftC (que
// arrastra TODA la carta hacia lo apagado mientras la celda objetivo
// mantiene su hex exacto sin desplazar) tenía que absorber cualquier choque
// con el gamut en las columnas extremas, por pequeño que fuera. lStep ahora
// se encoge hacia MIN_STEP_L cuando C0 lo pide.
//
// Medido específicamente sobre los dos casos que el debt note reporta
// ("#e7a34b", 30 seeds cada uno):
// - facil/4×4: mean|shiftC| 0.1057 → 0.0674 (mejora real, ~36%)
// - dificil/8×8: mean|shiftC| 0.0885 → 0.0885 — SIN CAMBIO, cada seed sigue
//   limitado por gamut ya en L0 (mejor caso posible, lStep→0)
// Renderizando facil/4×4 seed 4 (el peor de la muestra) tras el fix, el
// objetivo sigue visualmente evidente contra su fila:
// "#a9a34e #e1a65d #f0b46b #ffc279 / ... / #a9a49e [#e7a34b] #c5c0ba #d4cec8"
// — el bug reportado ("carta casi monocroma salvo una celda evidente")
// sigue reproduciéndose. Este fix es más correcto matemáticamente y no
// regresa nada, pero cerrar el residuo exigiría encoger spreadC para
// targets saturados — decisión de balance de dificultad, fuera de alcance
// aquí (ver Nota de método: las decisiones de PRD/DIFFICULTY no se reabren
// a mitad de un fix puntual).
//
// Reposition (Sprint 6, 2026-08-25) — ver docs/superpowers/specs/2026-08-25-grid-target-reposition-design.md.
// La posición del target ahora se elige, cuando es posible, entre las
// posiciones donde el ajuste de gamut ya da shift cero (findFeasiblePositions)
// en vez de forzar la carta a encajar alrededor de una posición random.
// Cierra AL 100% varios casos reales (medidos, no optimistas):
describe("grid.gamutFit", () => {
  // toBeCloseTo(0, 9) en vez de toBe(0) exacto: la cancelación en punto
  // flotante deja un residuo de ~1e-18 en algunos seeds (p.ej. seed 4 de
  // facil/4x4, seed 10 de medio/8x8 #d4af37) — nada mide eso (se pierde en
  // la cuantización de 8 bits al pasar a hex), y es coherente con la propia
  // tolerancia de 1e-9 que findFeasiblePositions usa para definir "feasible".
  it("facil/4x4 con #e7a34b: reposition lo cierra del todo, shiftC=0 en las 30 seeds (antes mean 0.026)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 4, difficulty: "facil", targetHex: "#e7a34b" });
      expect(shiftC).toBeCloseTo(0, 9);
    }
  });

  it("medio/8x8 con #6b3fa0 (morado — uno de los casos reportados en vivo): reposition lo cierra del todo, shiftC=0 en las 30 seeds", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 8, difficulty: "medio", targetHex: "#6b3fa0" });
      expect(shiftC).toBeCloseTo(0, 9);
    }
  });

  it("medio/8x8 con #d4af37 (oro — otro caso reportado en vivo): reposition lo cierra del todo, shiftC=0 en las 30 seeds", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 8, difficulty: "medio", targetHex: "#d4af37" });
      expect(shiftC).toBeCloseTo(0, 9);
    }
  });

  // Los siguientes tres casos NO se cierran — confirmado analíticamente:
  // findFeasiblePositions devuelve el set vacío para estos, ni siquiera
  // encogiendo cStep hasta ABSOLUTE_MIN_STEP_C cabe la fila en ninguna
  // posición del tamaño elegido. Es geometría real (gamut sRGB es angosto
  // en magenta/rojo muy saturado en casi todo L), no una limitación del
  // algoritmo de búsqueda. Cerrarlo del todo exige encoger spreadC —
  // decisión de balance que reabre DIFFICULTY, diferida (ver MATIZ-SPRINTS.md).

  it("dificil/8x8 con #e7a34b: pared geométrica real, reposition no cierra este caso (mean|shiftC| ~0.076, sin cambio respecto al fix anterior)", () => {
    let sum = 0;
    const N = 30;
    for (let seed = 0; seed < N; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 8, difficulty: "dificil", targetHex: "#e7a34b" });
      sum += Math.abs(shiftC);
    }
    expect(sum / N).toBeLessThanOrEqual(0.085);
  });

  it("medio/5x5 con #e91e8c (fucsia — caso reportado en vivo): pared geométrica real, sin cambio (mean|shiftC| ~0.084)", () => {
    let sum = 0;
    const N = 30;
    for (let seed = 0; seed < N; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 5, difficulty: "medio", targetHex: "#e91e8c" });
      sum += Math.abs(shiftC);
    }
    expect(sum / N).toBeLessThanOrEqual(0.095);
  });

  it("medio/6x6 con #b41919 (rojo tipo manzana — el caso reportado en vivo originalmente): pared geométrica real, sin cambio (mean|shiftC| ~0.046)", () => {
    let sum = 0;
    const N = 100;
    for (let seed = 0; seed < N; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 6, difficulty: "medio", targetHex: "#b41919" });
      sum += Math.abs(shiftC);
    }
    expect(sum / N).toBeLessThanOrEqual(0.055);
  });
});

describe("grid.decidable", () => {
  it("las celdas vecinas son distinguibles, salvo un residuo acotado (ver nota ABSOLUTE_MIN_STEP_C)", () => {
    let violationCount = 0;
    for (const difficulty of DIFFICULTIES) {
      for (const size of SIZES) {
        for (let seed = 0; seed < 50; seed++) {
          const spec = specsFor(difficulty, size, seed);
          const { cells } = buildGrid(spec);

          for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
              const current = cells[row]?.[col];
              if (!current) continue;

              const right = cells[row]?.[col + 1];
              if (right && deltaE(current.hex, right.hex) <= 0) violationCount++;

              const below = cells[row + 1]?.[col];
              if (below && deltaE(current.hex, below.hex) <= 0) violationCount++;
            }
          }
        }
      }
    }

    expect(violationCount).toBeLessThanOrEqual(MAX_ACCEPTABLE_VIOLATIONS);
  });
});

describe("grid.findFeasiblePositions", () => {
  it("target de croma moderado y L centrado: casi todas las posiciones son feasible, no todas (35/36 en medio/6x6 #7d69a8)", () => {
    const { L: L0, C: C0, H } = hexToOklch("#7d69a8");
    const feasible = findFeasiblePositions(L0, C0, H, 6, DIFFICULTY.medio);
    expect(feasible.length).toBe(35);
  });

  it("target muy desaturado (C0 cerca de C_MIN): restringido a posiciones cerca del extremo apagado — no es 'todo vale', el suelo C_MIN también limita (18/36 en medio/6x6 #6a5f52)", () => {
    const { L: L0, C: C0, H } = hexToOklch("#6a5f52");
    const feasible = findFeasiblePositions(L0, C0, H, 6, DIFFICULTY.medio);
    expect(feasible.length).toBe(18);
  });

  it("target muy saturado (C0 cerca de C_MAX) en carta pequeña: ninguna posición sirve, set vacío — ejercita la rama de fallback en buildGridLattice", () => {
    const { L: L0, C: C0, H } = hexToOklch("#ff0000");
    const feasible = findFeasiblePositions(L0, C0, H, 4, DIFFICULTY.dificil);
    expect(feasible.length).toBe(0);
  });
});

// Medido durante el diseño (ver spec): 10/600 = 1.7% sobre esta misma
// muestra. Cap generoso (no el número exacto) por la misma razón que
// MAX_ACCEPTABLE_VIOLATIONS: no esconder una regresión real detrás de un
// número que se ajusta hasta que el sample de turno pasa.
describe("grid.fallbackRate", () => {
  it("con reposition, el fallback (ninguna posición feasible) es raro sobre la muestra estándar de SAMPLE_TARGETS", () => {
    let fallbackCount = 0;
    let total = 0;
    for (const difficulty of DIFFICULTIES) {
      for (const size of SIZES) {
        for (let seed = 0; seed < 50; seed++) {
          const spec = specsFor(difficulty, size, seed);
          const { L: L0, C: C0, H } = hexToOklch(spec.targetHex);
          const feasible = findFeasiblePositions(L0, C0, H, spec.size, DIFFICULTY[spec.difficulty]);
          total++;
          if (feasible.length === 0) fallbackCount++;
        }
      }
    }
    expect(total).toBe(600);
    expect(fallbackCount).toBeLessThanOrEqual(30);
  });
});
