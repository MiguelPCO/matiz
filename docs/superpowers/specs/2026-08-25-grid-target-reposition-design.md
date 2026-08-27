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

Sin RNG — función pura de color + tamaño + dificultad.

**Corrección de diseño (encontrada midiendo, no en el primer borrador):**
la definición correcta de "feasible" NO es "el paso nominal completo
(`desiredCStep`) cabe sin desplazar". Esa versión inicial se probó y
producía fallback en el 67.5% de una muestra estándar — demasiado
conservadora, porque ignoraba que el algoritmo YA sabe encoger `cStep`
(hasta `ABSOLUTE_MIN_STEP_C`) sin necesidad de `shiftC` en absoluto,
siempre que la posición lo permita. La definición correcta —y la que de
verdad predice si `buildGridLattice` terminará con `shiftC = 0`— es:
**reusar exactamente la maquinaria ya existente** (la búsqueda adaptativa
de `lStep` + el `affordableCStep` posicional, ambas ya en producción) evaluada
en la posición candidata, y comprobar si el resultado da `shiftL = 0 Y
shiftC = 0`. Con la definición corregida, la tasa de fallback sobre la
misma muestra baja a 1.7%.

Concretamente: para cada candidata `(tr, tc)` en `0..size-1 × 0..size-1`,
ejecutar la misma lógica que hoy vive dentro de `buildGridLattice` (la
búsqueda binaria de `lStep`, luego `fromTop`/`fromBottom`/`affordableCStep`,
luego `shiftC`) parametrizada por esa `(tr, tc)` en vez de leerla de una
variable de módulo — y quedarse con la posición solo si `shiftL` y
`shiftC` resultantes son exactamente 0. Esto implica extraer esa lógica a
una función interna reutilizable (ver siguiente sección) para no
duplicar el algoritmo dos veces en el archivo.

Coste: `size²` evaluaciones completas (≤ 64 en 8×8), cada una con hasta
`2` llamadas a `maxInGamutChroma` más la búsqueda binaria de 24
iteraciones ya existente — sigue siendo trivial (una carta se genera una
vez por ronda, no en un hot loop).

### Extraer la lógica compartida: `computeLatticeParams`

Para que `findFeasiblePositions` pueda evaluar candidatas sin duplicar el
algoritmo, la parte de `buildGridLattice` que va desde "calcular
`nominalLStep`/`desiredCStep`" hasta "calcular `shiftC`" (líneas
105–170 del archivo actual) se extrae a una función interna (no
exportada, `lib/grid.ts` la usa desde ambos sitios):

```ts
interface LatticeParams {
  readonly shiftL: number;
  readonly shiftC: number;
  readonly lStep: number;
  readonly cStep: number;
}

function computeLatticeParams(
  tr: number,
  tc: number,
  L0: number,
  C0: number,
  H: number,
  size: GridSize,
  cfg: DifficultyConfig,
): LatticeParams
```

Cuerpo: exactamente el código ya existente (búsqueda binaria de `lStep`
vía `lBoundsFor`, luego `fromTop`/`fromBottom`/`affordableCStep`/`cStep`,
luego `shiftC`), solo que `tr`/`tc` son parámetros en vez de leerse de
variables ya calculadas en el scope exterior. `buildGridLattice` pasa a
llamar a esta función una vez con la posición final elegida;
`findFeasiblePositions` la llama `size²` veces, una por candidata.

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
const { shiftL, shiftC, lStep, cStep } = computeLatticeParams(tr, tc, L0, C0, H, size, cfg);
```

(El patrón `?? feasible[0] ?? {tr:0,tc:0}` sigue la misma idiom ya usada
en `grid.test.ts` para satisfacer `noUncheckedIndexedAccess` sin `!` —
`feasible[0]` es inalcanzable como `undefined` dado `feasible.length > 0`,
pero el compilador no lo sabe; el tercer fallback es puramente defensivo
y nunca se ejecuta en la práctica.)

Cuando la posición viene del set feasible, `computeLatticeParams` sobre
esa misma posición simplemente confirma lo que ya es cierto por
construcción (`shiftL` y `shiftC` dan 0) — no hace ningún trabajo extra
respecto a lo que `findFeasiblePositions` ya evaluó, solo se recalcula
una vez más por claridad (barato, ver nota de coste arriba). Cuando cae
al fallback (set vacío), el comportamiento es idéntico byte a byte al
que ya está en producción hoy — es literalmente el mismo código, ahora
factorizado en una función.

### Determinismo

Sigue siendo función pura del `seed` (mismo `GridSpec` ⟹ mismo `Grid`,
invariante de `grid.deterministic` intacta) — pero el mapeo concreto
`seed → (tr,tc)` cambia respecto a hoy para casi todo target saturado.
Esperado y aceptado: ningún test ni código depende de esa mapeo exacta
fuera de los valores ya pineados en `grid.gamutFit`/`grid.decidable`, que
se re-miden como parte de este trabajo.

### Testing

Números reales medidos durante el diseño (implementación de referencia
en un script descartable, misma lógica que esta spec describe — el
plan de implementación los vuelve a producir desde el código real):

| Caso | Antes (fallback siempre) | Con reposition |
|---|---|---|
| facil/4×4 `#e7a34b` | mean\|shiftC\| 0.026 (11/30 en 0) | **0/30 fallback, shiftC=0 siempre** |
| medio/8×8 `#6b3fa0` (morado) | fallback | **0/30 fallback, shiftC=0 siempre** |
| medio/8×8 `#d4af37` (oro) | fallback | **0/30 fallback, shiftC=0 siempre** |
| dificil/8×8 `#e7a34b` | mean\|shiftC\| 0.076 | **sin cambio — 30/30 fallback**, pared geométrica real |
| medio/5×5 `#e91e8c` (fucsia) | mean\|shiftC\| 0.084 | **sin cambio — 30/30 fallback** |
| medio/6×6 `#b41919` (rojo tipo manzana) | mean\|shiftC\| 0.046 | **sin cambio — 100/100 fallback** |
| Muestra estándar (10 hex × 4 tamaños × 3 dificultades × 50 seeds) | — | **fallback en 1.7%** (10/600) |
| `grid.decidable`, misma muestra | 41 violaciones (línea base sesión anterior) | **33 violaciones** (cap 130) |

> **Nota posterior (2026-08-27):** los tres casos "sin cambio" de la tabla
> quedaron mejorados (no cerrados del todo) por un fix de seguimiento —
> `findLeastShiftPositions` en `lib/grid.ts`, ver MATIZ-SPRINTS.md § Cuarto
> fix. Esta tabla queda como registro histórico de esta spec, no como
> estado actual.

Confirmado con un candidato analítico para los tres casos "sin cambio":
son posiciones donde `findFeasiblePositions` devuelve el set vacío — ni
siquiera con `cStep` encogido hasta `ABSOLUTE_MIN_STEP_C` cabe la fila en
ninguna posición del tamaño elegido. No es una limitación del algoritmo
de búsqueda, es geometría real: fucsia/rojo muy saturados en cartas
≥5×5 siguen sin cierre posible sin encoger `spreadC` (decisión
explícitamente fuera de alcance, ver más abajo).

- **`grid.gamutFit` (re-pinear con los números reales de arriba):** los
  dos casos históricos (`facil/4×4`, `dificil/8×8` con `#e7a34b`) más los
  tres casos nuevos que reproducen literalmente lo reportado
  (`fucsia`/`morado`/`oro`/rojo-manzana).
- **`grid.decidable`:** actualizar el número esperado (33, cap sigue en
  130 — sin regresión, mejora ligera).
- **Unit test directo de `findFeasiblePositions`:** `#7d69a8` en
  medio/6×6 (croma moderado, C0≈0.097) debe devolver 35/36 posiciones
  feasible — caso "casi todo vale", no "todo vale": incluso un target de
  croma bajo puede tener posiciones no-feasible cerca del extremo
  apagado si `C0` está muy cerca de `C_MIN` (`#6a5f52`, C0≈0.025, da
  18/36 — documentar por qué en el comentario del test, no es un bug).
  `#ff0000` en dificil/4×4 (C0≈0.258, casi `C_MAX`) debe devolver el set
  vacío — ejercita la rama de fallback explícitamente.
- **Fallback rate:** ya medido arriba (1.7% en la muestra estándar) — se
  documenta el número real en `MATIZ-SPRINTS.md`, no hace falta más
  trabajo salvo que Miguel lo pida tras ver el número.

## Fuera de alcance / riesgos aceptados

- **Confirmado con Miguel tras medir:** el fallback (set vacío) sigue
  mostrando el residuo ya documentado para colores muy saturados
  (fucsia/rojo intenso) en tamaños ≥5×5 — este diseño lo cierra del todo
  para varios casos reales (facil/4×4, varios 8×8 medio) y reduce el
  fallback a 1.7% en una muestra estándar amplia, pero NO cierra el caso
  específico que Miguel reportó en vivo (fucsia, rojo tipo manzana).
  Decisión explícita: se implementa así igualmente — mejora real y sin
  costo de dificultad para la mayoría de casos — y el cierre completo
  para saturación extrema queda diferido (encoger `spreadC`,
  reabriendo `DIFFICULTY`), no se persigue en este trabajo.
- No se toca la distribución de posiciones "target puede caer en
  cualquier celda con igual probabilidad" — el target ahora solo puede
  caer en el subconjunto feasible. **Ver la sección siguiente, "Decisión
  abierta (pendiente de Miguel)", para el sesgo real medido y un caso
  degenerado que no es un simple sesgo — esto ya NO se trata como un
  riesgo aceptado sin más.**

## Decisión abierta (pendiente de Miguel)

Corrección (whole-branch review, 2026-08-25, medido empíricamente sobre
12,000+ muestras) a una afirmación anterior de este mismo documento, que
decía que el sesgo posicional "puede sesgarse hacia el centro" y lo daba
por aceptado sin más — ambas cosas eran incorrectas:

- **Dirección y magnitud reales del sesgo:** el target NO se sesga hacia
  el centro. Se sesga hacia `tr=0` (la fila más vívida/arriba), porque
  ahí la restricción de croma hacia arriba (`fromTop`, ver
  `computeLatticeParams`) es vacía (`tr > 0 ? … : Infinity`) — cualquier
  posición en `tr=0` es más fácil de hacer feasible que una interior.
  Medido en 8×8: 32.8% de las posiciones elegidas caen en `tr=0`, frente
  al 12.5% esperado bajo distribución uniforme (2.6x sobre-representado).
  PRD no exige uniformidad de posición como mecánica, así que esto no es
  por sí solo un blocker — pero el caso siguiente sí es cualitativamente
  distinto de un simple sesgo.
- **Caso degenerado, no solo sesgo — posición de respuesta fija:**
  `dificil/5×5` con `targetHex = "#e7a34b"` (el ámbar de marca del
  propio proyecto, uno de los `SAMPLE_TARGETS` de test) tiene
  exactamente **una** posición feasible (`tr=0, tc=3`). El target cae en
  esa misma celda en el 100% de las partidas — 300/300 seeds probados,
  cero variación. No es sesgo, es una posición de respuesta fija y
  predecible para una combinación real de tamaño/dificultad/color que el
  juego genera hoy.

**Esto queda como decisión abierta pendiente de que Miguel la vea y
decida, no como riesgo ya aceptado.** Cerrarlo (más feasible positions
para este caso, o un fallback que reintroduzca variedad cuando
`feasible.length` es muy pequeño) es una decisión de producto/balance —
no se implementa en este fix, que es solo documentación + tests de
wiring. `GridLattice` ahora expone `shiftL` (antes solo `shiftC`), así
que este tipo de caso es verificable en test sin depender de renderizar
en vivo.
