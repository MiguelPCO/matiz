# Modo Diario, diseño

## Contexto

MVP cerrado en Sprint 5 (pendiente solo la prueba de móvil real de Miguel).
Este es el primer sprint post-MVP. El PRD marca **Modo Diario** como
prioridad #1 post-MVP y "la palanca de alcance real" — un matiz compartido
al día + tarjeta de resultado compartible, al estilo Wordle. En el MVP
existe únicamente como botón bloqueado ("Diario · Próximamente") en Home.

**Punto de partida:** no existe ningún subsistema de persistencia en el
proyecto — cero uso de `localStorage` en todo el código. Diario lo
introduce desde cero.

**Decisión de arquitectura confirmada con Miguel:** Diario se construye
**aparte** del motor compartido (`lib/engine.ts` / `useGame`), no como un
tercer `GameMode`. Razón: Diario no tiene Setup, no tiene pista definida
por el jugador, es una sola ronda, y necesita persistencia — extender
`GameState`/el reducer para eso ensuciaría las invariantes de Solo/Duelo
(`hasPlayed`, `activeIndex`, `players`) sin necesidad. Diario reutiliza
**componentes de UI puros** (`ColorCard`, `Thermometer`, `HintRow`,
`Reveal`), pero tiene su propio estado, su propia ruta y su propia lógica
de puntuación — duplicada intencionalmente de `lib/engine.ts` en vez de
exportar piezas de ahí, para mantener esa separación honesta (ver más
abajo).

**Deuda técnica conocida que Diario hereda tal cual:** el residuo de
`shiftC`/gamut documentado en `MATIZ-SPRINTS.md` (targets saturados en
`dificil/8×8` siguen pudiendo delatarse por contraste). El rango curado de
targetHex de Diario (ver abajo) se elige deliberadamente lejos de los
extremos de saturación que disparan ese residuo — no lo resuelve, lo
evita en la práctica para este modo.

## Config fija

**6×6 / Medio para todos, todos los días.** Sin picker, sin variación por
jugador — necesario para que los resultados compartidos sean comparables
entre personas distintas el mismo día.

## Generación del puzzle — `lib/daily.ts` (nuevo, puro)

```ts
export function localDateKey(d: Date = new Date()): string {
  // YYYY-MM-DD en la zona horaria del dispositivo — el límite del "día" es
  // la medianoche local, no UTC (decisión confirmada: sin backend, más
  // simple; alguien viajando puede ver dos "días" en pocas horas, aceptado
  // para este modo).
}

function hashSeed(key: string): Seed {
  // FNV-1a de 32 bits sobre localDateKey() → Seed determinista.
}

const TARGET_L_RANGE = [0.4, 0.72] as const; // evita extremos claro/oscuro
const TARGET_C_RANGE = [0.06, 0.16] as const; // moderado — lejos del
// residuo de shiftC documentado en MATIZ-SPRINTS.md, que se dispara con C0
// más alto combinado con posición de fila desfavorable

export function buildDailyGridSpec(d: Date = new Date()): GridSpec {
  const key = localDateKey(d);
  const targetSeed = hashSeed(key);
  const next = rng(targetSeed);
  const L = TARGET_L_RANGE[0] + next() * (TARGET_L_RANGE[1] - TARGET_L_RANGE[0]);
  const C = TARGET_C_RANGE[0] + next() * (TARGET_C_RANGE[1] - TARGET_C_RANGE[0]);
  const H = next() * 360;
  const targetHex = oklchToHex({ L, C, H });

  // Seed de layout distinto al de color — evita correlacionar tr/tc con
  // L/C/H (mismo seed produciría los primeros next() calls compartidos si
  // se reusara tal cual; no es un problema de seguridad, solo de variedad).
  const layoutSeed = hashSeed(key + "|layout");

  return { seed: layoutSeed, size: 6, difficulty: "medio", targetHex };
}
```

`buildGrid(buildDailyGridSpec())` de `lib/grid.ts` se reutiliza sin
cambios — el resto del pipeline de color/gamut es el mismo para todos los
modos.

## Estado — `hooks/useDaily.ts` (nuevo, `useReducer` propio, sin `useGame`)

Un solo `Round` local (reutiliza la interfaz `Round`/`Guess`/`Hint` de
`lib/types.ts`, pero nunca vive dentro de `GameState.rounds`):

```ts
type DailyPhase = "loading" | "playing" | "result";

interface DailyState {
  readonly phase: DailyPhase;
  readonly gridSpec: GridSpec | null;
  readonly round: Round | null; // guesserId/setterId: valores fijos placeholder, no se usan
}

type DailyAction =
  | { type: "HYDRATE"; cached: DailyResult | null } // desde localStorage, en mount
  | { type: "GUESS"; row: number; col: number }
  | { type: "REQUEST_HINT"; kind: HintKind };
```

**Lógica de `GUESS`/`REQUEST_HINT`:** mismas fórmulas que
`applyGuess`/`applyHint` en `lib/engine.ts` (distancia Chebyshev para
`ring`, `deltaE` normalizado para `closeness`, los mismos umbrales de
texto de pista) — **duplicadas aquí a propósito**, no importadas, porque
esas dos funciones no están exportadas y están atadas a la forma de
`GameState`. Comentario explícito en el código señalando que espejan
`engine.ts` línea por línea, para que un cambio futuro en las fórmulas de
puntuación recuerde tocar los dos sitios.

**Persistencia** — `localStorage["matiz-daily-v1"]`:

```ts
interface DailyStorage {
  readonly date: string; // localDateKey()
  readonly result: {
    readonly guesses: readonly Guess[];
    readonly hints: readonly Hint[];
    readonly status: "solved" | "failed";
    readonly score: number;
  };
}
```

Se escribe **una sola vez**, cuando la ronda termina (mismo patrón que ya
no persiste nada a mitad de partida en Solo/Duelo — un refresh a mitad de
Diario también pierde progreso, consistente con el resto del proyecto).
`useDaily` despacha `HYDRATE` desde un único `useEffect` en el montaje del
hook (lee `localStorage`, calcula `localDateKey()`, compara): si
`localStorage["matiz-daily-v1"].date === localDateKey()`, salta directo a
`phase: "result"` con ese resultado cacheado — bloquea repetir el día.
Fecha distinta → ronda nueva desde cero (`buildDailyGridSpec()` recién
llamado), sin tocar el registro del día anterior (no hay historial,
decisión confirmada: solo el resultado de hoy, coherente con el PRD
original que marca `❌ Persistencia de partidas o histórico`).

## Pantalla — `app/diario/page.tsx` (nueva ruta, no toca `app/page.tsx`)

Ruta propia (no pasa por el `switch(state.phase)` de Solo/Duelo). Usa
`useDaily()` directamente:

- `phase: "loading"` — un frame antes de leer `localStorage` (evita
  parpadeo de contenido incorrecto en SSR/hidratación).
- `phase: "playing"` — mismo layout que `Play.tsx` pero sin `ClueBar`
  (Diario no tiene pista, decisión confirmada): `ColorCard` +
  `Thermometer` + `HintRow`, botón «Volver» a Home sin confirmación
  (Diario es una sola pantalla, sin Setup previo que perder).
- `phase: "result"` — reutiliza `Reveal.tsx` (ver cambio abajo) sin la
  sección de pista. El botón de acción original de `Reveal`
  (`actionLabel`/`onAction`) se usa para «Compartir resultado» (ver
  siguiente sección); debajo, un enlace secundario «Volver a inicio» hacia
  `/`.

## Cambio a componente compartido — `components/game/Reveal.tsx`

`clue` pasa de requerido a opcional:

```ts
interface RevealProps {
  readonly clue?: Clue; // antes: readonly clue: Clue
  // ...resto sin cambios
}
```

Cuando `clue` es `undefined`: no se renderiza el panel "Pista" (ni la
variante palabra ni la de imagen), y la animación GSAP salta directamente
el paso "0.8s — cross-fade de la pista" (guard `if (clue?.type === ...)`
en vez de `if (clue.type === ...)`). Todo lo demás — línea al objetivo,
pulso, contador de score, panel de acción — sin cambios. Solo/Duelo siguen
pasando `clue` siempre, así que su comportamiento no cambia en absoluto;
es una extensión aditiva, no una reescritura.

## Tarjeta de resultado — texto compartible, estilo Wordle

Función pura en `lib/daily.ts`:

```ts
export function buildShareText(dateKey: string, result: DailyResult): string {
  // "MATIZ 2026-08-23\n🟧⬜⬜\n42 pts, 1 pista"
  // símbolo por tiro: 🟩 ring 0, 🟨 ring 1, 🟧 ring 2, ⬜ ring 3+/sin acertar
}
```

En la UI: `navigator.share({ text })` si está disponible (móvil), si no,
`navigator.clipboard.writeText(text)` con confirmación visual breve
("Copiado"). Sin generación de imagen — cero superficie de canvas nueva.

## Home.tsx — desbloquear Diario

Botón "Diario · Próximamente" pierde `disabled`/badge, pasa a
`<Link href="/diario">`. Sin más cambios en Home.

## Testing

`lib/daily.test.ts`, mismo estilo que `grid.test.ts`:

- `localDateKey` determinista y estable dentro del mismo día.
- `buildDailyGridSpec`: misma fecha → mismo `GridSpec` siempre; fechas
  distintas → `targetHex` distinto en la gran mayoría de pares muestreados
  (no se exige 100%, dos fechas podrían coincidir por azar — se acota,
  mismo patrón que `grid.decidable`).
- `targetHex` resultante siempre cae dentro de `TARGET_L_RANGE`/
  `TARGET_C_RANGE` tras convertir de vuelta con `hexToOklch` (margen por
  redondeo de 8 bits).
- `buildShareText`: formato exacto para un `DailyResult` fijo de muestra
  (snapshot simple, no generativo).

Sin tests de componente (misma convención que el resto del proyecto —
SCHEMA §11 solo exige `lib/`). Verificación de pantalla vía Playwright:
Home→Diario (desbloqueado)→jugar una ronda→Reveal sin panel de
pista→tarjeta de resultado con botón compartir/copiar→recargar la
página→salta directo al resultado cacheado (bloquea replay)→cambiar la
fecha del sistema (o mockear `Date` en el test) confirma que un día
distinto sí permite jugar de nuevo.

## Fuera de alcance de este sprint

- Racha/historial multi-día — decisión confirmada, solo el resultado de
  hoy se persiste.
- Tarjeta de resultado como imagen — texto compartible únicamente.
- Cualquier dependencia de red (API de palabra/imagen) — el target sale
  100% de un hash local, sin fallback de error posible por diseño.
- Cerrar el residuo de gamut/`shiftC` documentado en `MATIZ-SPRINTS.md` —
  Diario lo evita con su rango curado, no lo resuelve de fondo.
- Tocar `lib/engine.ts` — cero cambios ahí, decisión explícita de Miguel
  aunque cueste ~30 líneas duplicadas en `lib/daily.ts`.
