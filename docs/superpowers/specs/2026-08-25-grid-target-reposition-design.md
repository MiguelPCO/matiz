# Reposicionar el target en vez de encoger el gradiente, diseño

## Contexto

`MATIZ-SPRINTS.md` § Deuda técnica documenta un residuo estructural en
`lib/grid.ts`: la celda objetivo nunca se desplaza (muestra su hex exacto,
SCHEMA §4.3), pero cuando la fila/columna que la contiene necesita más
croma o luminosidad de la que el gamut sRGB admite en esa posición fija,
el resto de la carta se desplaza (`shiftC`/`shiftL`) para caber — dejando
la celda objetivo evidente por contraste frente a sus vecinas.

Dos fixes locales ya aplicados (adaptive `lStep`, luego `cStep` acotado
por la posición real del target en su fila) redujeron el residuo medible
sustancialmente pero no lo cerraron: Miguel lo reportó en vivo cinco veces
seguidas con colores y tamaños distintos ("manzana" 6×6, "rosa" 8×8,
"fucsia" 5×5, "morado" 8×8 — este último con el target en la esquina
superior izquierda exacta, `tr=0, tc=0` —, "oro" 8×8). No es un caso
límite raro: es el comportamiento típico para cualquier color
medianamente saturado en cartas de 5×5 o más.

**Causa raíz identificada en esta sesión:** el algoritmo elige la
posición del target (`tr`, `tc`) por RNG **antes** de saber nada sobre el
color — luego fuerza al resto de la carta a encajar alrededor de esa
posición ya fija, encogiendo pasos o desplazando cuando la posición
resulta desfavorable para ese color en particular. La captura de "morado"
(target en la esquina, `tr=0`) muestra un segundo modo de fallo además
del ya conocido (posición-en-fila): el techo de gamut en las columnas
extremas puede quedar por debajo de `C0` incluso en la propia fila del
target, cuando la columna del target no coincide con ninguna de las dos
columnas extremas usadas para calcular `gamutCeiling`.

**Decisión confirmada con Miguel:** en vez de seguir encogiendo
`spreadC`/`spreadL` (lo que degrada la dificultad declarada — reabriría
la tabla `DIFFICULTY`, decisión de PRD cerrada), se invierte el orden:
**elegir primero una posición donde el target quepa sin desplazar nada, y
solo si ninguna posición sirve, caer al comportamiento actual (best
effort, ya mejorado, nunca peor que lo ya en producción).**

## Alcance

Toca únicamente `lib/grid.ts` (función `buildGridLattice`) y
`lib/grid.test.ts`. No toca `cfg.spreadL`/`cfg.spreadC`/`DIFFICULTY` en
`lib/types.ts`, ni ningún componente de UI, ni `lib/color.ts`. Fuera de
alcance: unificar esto con el residuo ya evitado-por-rango-curado de
`lib/daily.ts` (Diario sigue sin necesitarlo, su rango curado de
`targetHex` ya evita la zona problemática deliberadamente).

## Diseño

### `findFeasiblePositions` — nueva función pura, exportada

```ts
export interface FeasiblePosition {
  readonly tr: number;
  readonly tc: number;
}

export function findFeasiblePositions(
  L0: number,
  C0: number,
  H: number,
  size: GridSize,
  cfg: DifficultyConfig,
): FeasiblePosition[]
```

Sin RNG — función pura de color + tamaño + dificultad. Para cada columna
`tc` (0..size-1), calcula los extremos de L a `nominalLStep` (la misma
fórmula ya existente: `max(cfg.spreadL/(size-1), MIN_STEP_L)`) centrados
en esa columna. Si esos extremos caen fuera de `[L_MIN, L_MAX]` —
exigirían `shiftL != 0` — la columna entera se descarta (ninguna fila en
esa columna puede ser feasible). Si caen dentro, calcula `gamutCeiling`
igual que hoy (`min` de `maxInGamutChroma` en ambos extremos de L, con
`C_MAX` como techo absoluto).

Con ese `gamutCeiling` fijo para la columna, recorre cada fila `tr`
(0..size-1) y comprueba si el rango de croma que esa fila necesita a
`desiredCStep` (`max(cfg.spreadC/(size-1), MIN_STEP_C)`, la misma fórmula
ya existente) cabe en `[C_MIN, gamutCeiling]` sin desplazar. Si ambos
extremos caben, `(tr, tc)` es feasible.

Coste: como mucho `size²` combinaciones (≤ 64 en 8×8), con como mucho
`2×size` llamadas a `maxInGamutChroma` (una vez por columna) — trivial,
se ejecuta una vez por carta generada.

### Selección de posición en `buildGridLattice`

El cálculo de `L0`/`C0`/`H`/`cfg` (hoy ya presente, vía `hexToOklch` +
`DIFFICULTY[difficulty]`) se mueve antes de la selección de posición —
reordenamiento puro, sin cambio de comportamiento en sí mismo. Luego:

```ts
const feasible = findFeasiblePositions(L0, C0, H, size, cfg);
let tr: number, tc: number;
if (feasible.length > 0) {
  const idx = Math.floor(next() * feasible.length);
  const picked = feasible[idx] ?? feasible[0] ?? { tr: 0, tc: 0 };
  tr = picked.tr;
  tc = picked.tc;
} else {
  tr = Math.floor(next() * size);
  tc = Math.floor(next() * size);
}
```

(El patrón `?? feasible[0] ?? {tr:0,tc:0}` sigue la misma idiom ya usada
en `grid.test.ts` para satisfacer `noUncheckedIndexedAccess` sin `!` —
`feasible[0]` es inalcanzable como `undefined` dado `feasible.length > 0`,
pero el compilador no lo sabe; el tercer fallback es puramente defensivo
y nunca se ejecuta en la práctica.)

El resto de `buildGridLattice` — búsqueda adaptativa de `lStep`, `cStep`
posicional, `shiftC` residual — **no cambia ni una línea**. Cuando la
posición viene del set feasible, esa maquinaria simplemente confirma lo
que ya es cierto por construcción (`shiftL` y `shiftC` resuelven a 0) en
vez de tener que corregir nada. Cuando cae al fallback (set vacío), el
comportamiento es idéntico byte a byte al que ya está en producción hoy.

### Determinismo

Sigue siendo función pura del `seed` (mismo `GridSpec` ⟹ mismo `Grid`,
invariante de `grid.deterministic` intacta) — pero el mapeo concreto
`seed → (tr,tc)` cambia respecto a hoy para casi todo target saturado.
Esperado y aceptado: ningún test ni código depende de esa mapeo exacta
fuera de los valores ya pineados en `grid.gamutFit`/`grid.decidable`, que
se re-miden como parte de este trabajo.

### Testing

- **`grid.gamutFit` (re-medir, re-pinear):** los dos casos históricos
  (`facil/4×4`, `dificil/8×8` con `#e7a34b`) más nuevos casos que
  reproducen literalmente lo reportado — targets fucsia/morado/oro-ish en
  5×5 y 8×8 — con la metodología ya establecida (30 seeds, mean
  `|shiftC|`, números reales medidos, no optimistas).
- **`grid.decidable`:** debe mantenerse igual o mejorar (nunca peor) —
  posiciones feasible usan siempre el paso nominal completo, que es
  mayor o igual que cualquier paso encogido que el algoritmo pudiera
  haber usado antes.
- **Unit test directo de `findFeasiblePositions`:** un target neutro de
  croma bajo en L medio debe devolver las `size²` posiciones como
  feasible (caso trivial, sanity check). Un target cerca de `C_MAX` en un
  tamaño pequeño debe devolver un set pequeño o vacío — ejercita
  explícitamente la rama de fallback.
- **Medir tasa de fallback:** cuántos de los `SAMPLE_TARGETS` × tamaños ×
  dificultades existentes en `grid.test.ts` caen en el set vacío
  (fallback). Si resulta ser una fracción no trivial, se documenta como
  nuevo dato en `MATIZ-SPRINTS.md`; no se optimiza más allá de esta
  spec salvo que Miguel lo pida tras ver el número real.

## Fuera de alcance / riesgos aceptados

- El fallback (set vacío) sigue mostrando el residuo ya documentado —
  este diseño lo minimiza drásticamente, no promete cerrarlo al 100%
  para combinaciones matemáticamente imposibles (target ya contra la
  pared del gamut en toda posición del tamaño elegido).
- No se toca la distribución de posiciones "target puede caer en
  cualquier celda con igual probabilidad" — para targets muy saturados,
  el target ahora solo puede caer en el subconjunto feasible, que puede
  sesgarse hacia el centro de la carta en tamaños grandes. No se
  considera un problema de juego (PRD no exige uniformidad de posición
  como mecánica), pero se deja anotado por si Miguel lo nota jugando.
