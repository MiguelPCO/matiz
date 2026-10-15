# Reposicionar el target en el grid, en vez de encoger el gradiente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elegir la posición del target en `buildGridLattice` de forma que, cuando sea posible, la carta entera encaje en gamut sin necesitar ningún desplazamiento de croma/luminosidad (`shiftC`/`shiftL`) — en vez de fijar la posición por RNG puro y forzar el resto de la carta a encajar alrededor de ella después.

**Architecture:** Se extrae la lógica de ajuste de gamut ya existente en `buildGridLattice` (búsqueda adaptativa de `lStep`, `cStep` posicional, `shiftC` residual) a una función pura `computeLatticeParams(tr, tc, ...)`. Una nueva función `findFeasiblePositions` evalúa esa misma lógica para cada una de las `size²` posiciones posibles y se queda con las que dan `shiftL = 0 Y shiftC = 0`. `buildGridLattice` elige uniformemente entre esas posiciones vía RNG; si el set está vacío, cae exactamente al comportamiento actual (RNG puro sobre `tr`/`tc`, sin cambios).

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess: true`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-grid-target-reposition-design.md`

## Global Constraints

- No tocar `cfg.spreadL`/`cfg.spreadC`/la tabla `DIFFICULTY` en `lib/types.ts` — este trabajo es puramente de posicionamiento, no de balance de dificultad.
- No tocar `lib/color.ts` ni ningún componente de UI.
- Determinismo: misma `GridSpec` ⟹ misma `Grid` (invariante ya cubierta por `grid.deterministic`, no debe romperse).
- El criterio de "feasible" es **`shiftL === 0 Y shiftC === 0` evaluados con la maquinaria adaptativa ya existente** (búsqueda de `lStep` + `affordableCStep` posicional) — NO "el paso nominal completo cabe sin encoger". Esa definición alternativa se probó y da 67.5% de fallback en la muestra estándar; la correcta da 1.7%. Ver spec § Diseño para el razonamiento completo.
- Cuando el set de posiciones feasible está vacío, el comportamiento debe ser **byte-idéntico** al ya existente en producción hoy (mismo RNG, mismo cálculo).
- Indexado seguro sobre arrays bajo `noUncheckedIndexedAccess`: usar el mismo idiom ya presente en `grid.test.ts` (`arr[i] ?? arr[0]`), nunca `!`.
- Commits: autor únicamente "Miguel <xtremzmiguel@gmail.com>", sin trailer de co-autoría de IA.
- No hacer `git push` — deja los commits locales, el push se aprueba aparte.

---

### Task 1: Extraer `computeLatticeParams` de `buildGridLattice` (refactor puro, sin cambio de comportamiento)

**Files:**
- Modify: `lib/grid.ts:78-184` (función `buildGridLattice` completa)

**Interfaces:**
- Produces: `interface LatticeParams { readonly shiftL: number; readonly shiftC: number; readonly lStep: number; readonly cStep: number; }` y `function computeLatticeParams(tr: number, tc: number, L0: number, C0: number, H: number, size: GridSize, cfg: DifficultyConfig): LatticeParams` — no exportada (uso interno del archivo). Tasks 2 y 3 la consumen.

Este task es un refactor de comportamiento idéntico: mueve código ya existente a una función, sin cambiar ni una fórmula. La suite de tests ya existente (`grid.deterministic`, `grid.minStep`, `grid.gamutFit`, `grid.decidable`) es la red de seguridad — debe seguir pasando exactamente igual, sin tocar sus números pineados (eso es Task 3).

- [ ] **Step 1: Confirmar la suite pasa en verde antes de tocar nada (baseline)**

Run: `pnpm test`
Expected: `6 passed (6)`, `42 passed (42)` (ese es el estado actual del repo).

- [ ] **Step 2: Añadir el import de `DifficultyConfig`**

En `lib/grid.ts:3`, cambiar:

```ts
import type { Cell, Grid, GridSize, GridSpec, Seed } from "./types";
```

por:

```ts
import type { Cell, DifficultyConfig, Grid, GridSize, GridSpec, Seed } from "./types";
```

- [ ] **Step 3: Extraer `computeLatticeParams`**

Insertar esta función nueva entre `GridLattice` (termina en `lib/grid.ts:76`) y `buildGridLattice` (empieza en `lib/grid.ts:78`) — es decir, justo antes de `export function buildGridLattice`:

```ts
interface LatticeParams {
  readonly shiftL: number;
  readonly shiftC: number;
  readonly lStep: number;
  readonly cStep: number;
}

/**
 * El ajuste de gamut para UNA posición candidata del target. Extraída de
 * buildGridLattice para que findFeasiblePositions (más abajo) pueda
 * evaluarla en cualquier (tr, tc), no solo en la que el RNG dibujó.
 */
function computeLatticeParams(
  tr: number,
  tc: number,
  L0: number,
  C0: number,
  H: number,
  size: GridSize,
  cfg: DifficultyConfig,
): LatticeParams {
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
  // extremas, más cerca de L0, dejen hueco de gamut suficiente.
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
    lStep = lo;
    lBounds = loBounds;
  }

  const { shiftL, gamutCeiling } = lBounds;
  // C0 es un punto fijo en la fila del objetivo (nunca se desplaza, PRD
  // §4.3) — el paso máximo que cabe sin shiftC no es simétrico sobre el
  // rango [C_MIN, gamutCeiling], es el hueco real desde C0 hacia cada
  // extremo dividido entre cuántas filas hay que recorrer para llegar ahí.
  const fromTop = tr > 0 ? (gamutCeiling - C0) / tr : Infinity;
  const fromBottom = tr < size - 1 ? (C0 - C_MIN) / (size - 1 - tr) : Infinity;
  const affordableCStep = Math.min(fromTop, fromBottom);
  const cStep = Math.max(ABSOLUTE_MIN_STEP_C, Math.min(desiredCStep, affordableCStep));

  // El croma tampoco puede bajar de C_MIN (fila apagado, row=size-1, igual
  // en toda columna). Un shiftC uniforme conserva cStep exacto en toda la
  // carta (nunca colapsa dos filas distintas al mismo borde).
  const minRawC = C0 - (size - 1 - tr) * cStep;
  const maxRawC = C0 + tr * cStep;
  const shiftCLowerBound = C_MIN - minRawC;
  const neededGamutShift = Math.min(0, gamutCeiling - maxRawC);
  const shiftC = Math.max(shiftCLowerBound, neededGamutShift);

  return { shiftL, shiftC, lStep, cStep };
}
```

- [ ] **Step 4: Reescribir `buildGridLattice` para usar `computeLatticeParams`**

Reemplazar el cuerpo completo de `buildGridLattice` (`lib/grid.ts:78-184`) por:

```ts
export function buildGridLattice(spec: GridSpec): GridLattice {
  const { size, difficulty, targetHex, seed } = spec;
  const next = rng(seed);
  const tr = Math.floor(next() * size);
  const tc = Math.floor(next() * size);

  const { L: L0, C: C0, H } = hexToOklch(targetHex);
  const cfg = DIFFICULTY[difficulty];

  const { shiftL, shiftC, lStep, cStep } = computeLatticeParams(tr, tc, L0, C0, H, size, cfg);

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
```

(Nota: esto todavía dibuja `tr`/`tc` por RNG puro, exactamente como hoy — Task 3 cambia esa parte. Este task solo mueve el cálculo de gamut a la función extraída.)

- [ ] **Step 5: Verificar que la suite sigue en verde, sin cambios**

Run: `pnpm typecheck && pnpm test`
Expected: mismo resultado que el Step 1 (`42 passed (42)`), ningún número pineado cambia — es un refactor de comportamiento idéntico.

- [ ] **Step 6: Commit**

```bash
git add lib/grid.ts
git commit -m "$(cat <<'EOF'
refactor: extract computeLatticeParams from buildGridLattice

Pure move, no behavior change -- the gamut-fit math (adaptive lStep
search, positional cStep, residual shiftC) now lives in a standalone
function parameterized by (tr, tc) instead of reading them from the
enclosing scope. Prepares for findFeasiblePositions (next task), which
needs to evaluate this same math at candidate positions other than the
one the RNG happened to draw.
EOF
)"
```

---

### Task 2: `findFeasiblePositions` — nueva función pura, con tests directos

**Files:**
- Modify: `lib/grid.ts` (añadir función, después de `computeLatticeParams`)
- Test: `lib/grid.test.ts` (nuevo `describe` block)

**Interfaces:**
- Consumes: `computeLatticeParams` (Task 1), `DifficultyConfig` (ya importado en Task 1).
- Produces: `interface FeasiblePosition { readonly tr: number; readonly tc: number; }` y `export function findFeasiblePositions(L0: number, C0: number, H: number, size: GridSize, cfg: DifficultyConfig): FeasiblePosition[]` — exportada, Task 3 la consume desde `buildGridLattice` y desde `grid.test.ts`.

- [ ] **Step 1: Escribir el test que falla (import de una función que aún no existe)**

En `lib/grid.test.ts`, cambiar la línea de import de `grid.ts` (línea 3):

```ts
import { buildGrid, buildGridLattice } from "./grid";
```

por:

```ts
import { buildGrid, buildGridLattice, findFeasiblePositions } from "./grid";
```

Y cambiar el import de `color.ts` (línea 2):

```ts
import { deltaE } from "./color";
```

por:

```ts
import { deltaE, hexToOklch } from "./color";
```

Añadir este `describe` block al final del archivo (después de `describe("grid.decidable", ...)`, que termina en la línea 189):

```ts

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
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `pnpm test`
Expected: FAIL — `findFeasiblePositions` no existe en `./grid` (error de import/compilación de TypeScript).

- [ ] **Step 3: Implementar `findFeasiblePositions`**

Añadir en `lib/grid.ts`, justo después de `computeLatticeParams` (antes de `export function buildGridLattice`):

```ts
export interface FeasiblePosition {
  readonly tr: number;
  readonly tc: number;
}

/**
 * Todas las posiciones (tr, tc) donde la carta encaja en gamut sin
 * necesitar NINGÚN desplazamiento (shiftL = 0 Y shiftC = 0) — evaluando
 * la misma maquinaria adaptativa que ya usa buildGridLattice, no una
 * versión simplificada. Pura, sin RNG: buildGridLattice la usa para
 * elegir la posición del target antes de generar el resto de la carta.
 */
export function findFeasiblePositions(
  L0: number,
  C0: number,
  H: number,
  size: GridSize,
  cfg: DifficultyConfig,
): FeasiblePosition[] {
  const feasible: FeasiblePosition[] = [];
  for (let tc = 0; tc < size; tc++) {
    for (let tr = 0; tr < size; tr++) {
      const { shiftL, shiftC } = computeLatticeParams(tr, tc, L0, C0, H, size, cfg);
      if (Math.abs(shiftL) < 1e-9 && Math.abs(shiftC) < 1e-9) {
        feasible.push({ tr, tc });
      }
    }
  }
  return feasible;
}
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — `45 passed (45)` (3 tests nuevos sobre los 42 existentes).

- [ ] **Step 5: Commit**

```bash
git add lib/grid.ts lib/grid.test.ts
git commit -m "$(cat <<'EOF'
feat: add findFeasiblePositions, target positions with zero gamut shift

Pure function -- for a given target color/size/difficulty, scans all
size^2 candidate (tr,tc) positions and keeps the ones where the
existing adaptive gamut-fit math (computeLatticeParams) already lands
on shiftL=0 and shiftC=0. Not wired into buildGridLattice yet (next
task) -- this task only adds and directly tests the function.
EOF
)"
```

---

### Task 3: Usar `findFeasiblePositions` para elegir la posición del target; re-medir y re-pinear tests

**Files:**
- Modify: `lib/grid.ts:78-93` (la parte de `buildGridLattice` que dibuja `tr`/`tc`)
- Modify: `lib/grid.test.ts` (re-pinear `grid.gamutFit`, actualizar `grid.decidable`, añadir `grid.fallbackRate`)
- Modify: `MATIZ-SPRINTS.md` (nueva entrada en § Deuda técnica conocida)

**Interfaces:**
- Consumes: `findFeasiblePositions` (Task 2), `computeLatticeParams` (Task 1).

- [ ] **Step 1: Cambiar cómo se eligen `tr`/`tc` en `buildGridLattice`**

En `lib/grid.ts`, reemplazar:

```ts
export function buildGridLattice(spec: GridSpec): GridLattice {
  const { size, difficulty, targetHex, seed } = spec;
  const next = rng(seed);
  const tr = Math.floor(next() * size);
  const tc = Math.floor(next() * size);

  const { L: L0, C: C0, H } = hexToOklch(targetHex);
  const cfg = DIFFICULTY[difficulty];

  const { shiftL, shiftC, lStep, cStep } = computeLatticeParams(tr, tc, L0, C0, H, size, cfg);
```

por:

```ts
export function buildGridLattice(spec: GridSpec): GridLattice {
  const { size, difficulty, targetHex, seed } = spec;
  const next = rng(seed);

  const { L: L0, C: C0, H } = hexToOklch(targetHex);
  const cfg = DIFFICULTY[difficulty];

  // Se elige la posición del target ANTES de generar el resto de la
  // carta, entre las posiciones donde el ajuste de gamut ya da shift
  // cero (ver findFeasiblePositions) — en vez de fijarla por RNG puro y
  // forzar al resto de la carta a encajar alrededor después. Si ninguna
  // posición sirve (target muy saturado, carta pequeña), cae al RNG puro
  // de siempre: mismo comportamiento que hoy en producción, nunca peor.
  const feasible = findFeasiblePositions(L0, C0, H, size, cfg);
  let tr: number;
  let tc: number;
  if (feasible.length > 0) {
    const idx = Math.floor(next() * feasible.length);
    const picked = feasible[idx] ?? feasible[0] ?? { tr: 0, tc: 0 };
    tr = picked.tr;
    tc = picked.tc;
  } else {
    tr = Math.floor(next() * size);
    tc = Math.floor(next() * size);
  }

  const { shiftL, shiftC, lStep, cStep } = computeLatticeParams(tr, tc, L0, C0, H, size, cfg);
```

El resto de la función (construcción de `cells` y `return`) no cambia.

- [ ] **Step 2: Correr la suite y ver qué falla**

Run: `pnpm test`
Expected: FAIL en `grid.gamutFit` (los dos tests existentes, `facil/4x4` y `dificil/8x8` con `#e7a34b`, tienen umbrales viejos — uno de los dos ahora pasa "de más", el otro debería seguir pasando). El resto de la suite (`grid.deterministic`, `grid.minStep`, `grid.decidable`, `grid.findFeasiblePositions`) debe seguir en verde — si `grid.deterministic` falla, hay un bug (la función dejó de ser determinista), parar y revisar antes de continuar.

- [ ] **Step 3: Re-pinear `grid.gamutFit` con los números reales**

Reemplazar el `describe("grid.gamutFit", ...)` completo (líneas 140–160 de `lib/grid.test.ts`) por:

```ts
// Reposition (Sprint 6, 2026-08-25) — ver docs/superpowers/specs/2026-08-25-grid-target-reposition-design.md.
// La posición del target ahora se elige, cuando es posible, entre las
// posiciones donde el ajuste de gamut ya da shift cero (findFeasiblePositions)
// en vez de forzar la carta a encajar alrededor de una posición random.
// Cierra AL 100% varios casos reales (medidos, no optimistas):
describe("grid.gamutFit", () => {
  it("facil/4x4 con #e7a34b: reposition lo cierra del todo, shiftC=0 en las 30 seeds (antes mean 0.026)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 4, difficulty: "facil", targetHex: "#e7a34b" });
      expect(shiftC).toBe(0);
    }
  });

  it("medio/8x8 con #6b3fa0 (morado — uno de los casos reportados en vivo): reposition lo cierra del todo, shiftC=0 en las 30 seeds", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 8, difficulty: "medio", targetHex: "#6b3fa0" });
      expect(shiftC).toBe(0);
    }
  });

  it("medio/8x8 con #d4af37 (oro — otro caso reportado en vivo): reposition lo cierra del todo, shiftC=0 en las 30 seeds", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { shiftC } = buildGridLattice({ seed, size: 8, difficulty: "medio", targetHex: "#d4af37" });
      expect(shiftC).toBe(0);
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
```

- [ ] **Step 4: Actualizar el comentario y verificar `grid.decidable`**

`MAX_ACCEPTABLE_VIOLATIONS` (línea 112 de `lib/grid.test.ts`) se queda en `130` — no se toca el cap (mismo criterio que ya documenta el comentario de esa constante: acotar con margen, no clavar el número exacto de la sesión). Solo verificar que el test sigue pasando:

Run: `pnpm test -- grid.test.ts -t "grid.decidable"`
Expected: PASS, con un conteo real que debe ser ≤130 (medido durante el diseño: 33, mejor que el baseline anterior de 41 — si el número real observado aquí es sensiblemente peor que eso, investigar antes de continuar en vez de asumir que es ruido).

- [ ] **Step 5: Añadir `grid.fallbackRate` — documentar la tasa de fallback medida**

Añadir al final de `lib/grid.test.ts`, después de `describe("grid.findFeasiblePositions", ...)`:

```ts

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
```

- [ ] **Step 6: Verificación completa**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: todo en verde. `pnpm test` debe reportar `50 passed (50)` — 45 de después de Task 2, menos los 2 tests viejos de `grid.gamutFit` que este step reemplaza, más los 6 nuevos de ese mismo describe block (neto +4), más 1 nuevo `grid.fallbackRate` (45-2+6+1=50). Verificar el conteo real en la salida en vez de asumir este número si no coincide, y ajustar solo si la discrepancia se explica.

- [ ] **Step 7: Verificación manual en navegador (opcional pero recomendada dado el historial de este bug)**

Levantar `pnpm dev` en un puerto libre, y en Duelo (que muestra el picker de tamaño/dificultad desde la ronda 1 sin necesitar `hasPlayed`), generar una pista de imagen con un color similar a `#b41919`/`#e91e8c` en medio/6×6 o medio/5×5 — confirmar que el bug reportado por Miguel (target evidente) sigue reproduciéndose ahí (es el caso NO cerrado, comportamiento esperado) — y con un color similar a `#6b3fa0`/`#d4af37` en medio/8×8, confirmar que ya NO se nota el target (caso SÍ cerrado). Cerrar el servidor dev al terminar.

- [ ] **Step 8: Actualizar `MATIZ-SPRINTS.md` § Deuda técnica conocida**

Añadir, después del último párrafo de la entrada `lib/grid.ts` existente (busca el texto que termina en "...no se persigue en este trabajo." de la sesión anterior, o el párrafo de "Residuo que sigue sin cerrar" si esa entrada no existe todavía en el archivo tal como esté en este punto), un nuevo párrafo:

```markdown
**Tercer fix aplicado (Sprint 6, 2026-08-25), reposicionamiento en vez de encogimiento:** en vez de seguir absorbiendo el residuo vía `shiftC`, se invirtió el orden — `buildGridLattice` ahora elige la posición del target (`tr`, `tc`) entre las posiciones donde la carta completa ya encaja en gamut sin desplazar nada (`findFeasiblePositions`, `lib/grid.ts`), en vez de fijarla por RNG puro antes de saber nada del color. Cuando ninguna posición sirve, cae exactamente al comportamiento anterior (best effort, sin regresión). No toca `cfg.spreadL`/`cfg.spreadC`/`DIFFICULTY`.

Medido (ver spec `docs/superpowers/specs/2026-08-25-grid-target-reposition-design.md` para la tabla completa):
- **Cierra al 100% varios casos reales:** facil/4×4 `#e7a34b` (antes mean\|shiftC\| 0.026), medio/8×8 con "morado" y "oro" (los colores exactos que Miguel reportó en vivo) — `shiftC` y `shiftL` exactamente 0 en las 30 seeds probadas en cada caso.
- **Fallback general sobre la muestra estándar (10 hex × 4 tamaños × 3 dificultades × 50 seeds): 1.7%** (10/600) — la mayoría de partidas reales generan una carta totalmente limpia ahora.
- **NO cierra el residuo para saturación extrema:** dificil/8×8 `#e7a34b`, "fucsia" en medio/5×5, y el rojo tipo manzana original en medio/6×6 (los otros dos casos que Miguel reportó en vivo) siguen en fallback el 100% de las veces, con el mismo residuo medido de sesiones anteriores — confirmado analíticamente que `findFeasiblePositions` devuelve el set vacío para estos: ni encogiendo `cStep` hasta `ABSOLUTE_MIN_STEP_C` cabe la fila en ninguna posición del tamaño elegido. No es una limitación del algoritmo de búsqueda — es que el gamut sRGB es angosto para magenta/rojo muy saturado en casi todo rango de luminosidad.
- `grid.decidable`: 41 → 33 violaciones (cap 130 sin cambio) — mejora, no regresión.

**Decisión explícita con Miguel:** se implementa así de todas formas — mejora real, gratuita en dificultad, para la mayoría de casos — y el cierre completo para saturación extrema sigue diferido (encogería `spreadC`, reabriendo `DIFFICULTY`, PRD cerrado). No se persigue en este trabajo.
```

- [ ] **Step 9: Commit**

```bash
git add lib/grid.ts lib/grid.test.ts MATIZ-SPRINTS.md
git commit -m "$(cat <<'EOF'
feat: choose target position by gamut feasibility, not pure RNG

buildGridLattice now picks (tr,tc) from findFeasiblePositions' output
when non-empty -- positions where the card fits gamut with zero shift
-- falling back to today's pure-random draw otherwise (byte-identical
in that branch).

Measured (see spec + MATIZ-SPRINTS.md for the full table): closes
several real cases completely (facil/4x4 #e7a34b, and the exact
"morado"/"oro" colors Miguel reported live) with shiftC=0 always.
Fallback rate on the standard 10-hex x 4-size x 3-difficulty sample:
1.7%. Does NOT close the residue for extreme saturation (dificil/8x8,
"fucsia" 5x5, apple-red 6x6) -- confirmed analytically as a genuine
gamut wall, not a search limitation. Decision confirmed with Miguel:
ship this improvement now, defer full closure (would require shrinking
spreadC, reopening the closed DIFFICULTY table) to a future session.
EOF
)"
```

---

## Verification (whole plan)

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — todo en verde.
2. `grid.deterministic` sigue pasando sin cambios (determinismo intacto).
3. `grid.gamutFit` refleja los números reales medidos, no los antiguos.
4. `grid.decidable` no regresiona (≤130, medido real ~33).
5. `MATIZ-SPRINTS.md` documenta el resultado real — qué cierra, qué no, y por qué.
6. Nada en `lib/types.ts` cambió.
7. Tres commits locales, sin push.
