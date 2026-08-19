# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repo

**Fase de definición, sin scaffold todavía.** No hay `package.json` ni código de aplicación — solo documentación de producto/arquitectura y un prototipo de referencia (`croma.jsx`). El siguiente paso planificado es Sprint 0 (ver `MATIZ-SPRINTS.md`): `create-next-app` con Next.js 15, React 19, TypeScript strict, Tailwind v4.

## Arranque en frío (cada sesión)

Sigue este orden de lectura — está definido en `START.md`:

1. `START.md` — contexto y estado actual del proyecto
2. `MATIZ-PRD.md` — qué se construye y por qué (**cerrado**, no se reabre durante ejecución)
3. `MATIZ-SCHEMA.md` — tipos, contratos de módulos, estructura de archivos (**cerrado**, vinculante — el código debe corresponderse con esto)
4. `MATIZ-SPRINTS.md` — plan de ejecución sprint por sprint
5. `croma.jsx` — prototipo jugable validado; lógica de referencia para portar en Sprint 1 (color math, `buildGrid`, `extractColor`)

**Regla:** PRD y SCHEMA están cerrados. Idea nueva → lista post-MVP en `MATIZ-SPRINTS.md`, no se ejecuta ahora.

No empieces una tarea de un sprint si el anterior no está en verde — el orden en `MATIZ-SPRINTS.md` es por dependencia, no por preferencia.

## Comandos (una vez exista el scaffold de Sprint 0)

```bash
pnpm dev            # desarrollo
pnpm build          # build de producción
pnpm test           # los 5 tests obligatorios del SCHEMA §11
pnpm tsc --noEmit   # comprobación de tipos — debe salir limpio siempre, cero any
```

## Arquitectura (de `MATIZ-SCHEMA.md`)

**Qué es:** MATIZ — juego de percepción cromática. Pista (palabra vía IA, o foto desaturada) → el jugador localiza el color exacto en una carta N×N de tonalidades del mismo tono (OKLCH, H fijo). Feedback por termómetro de proximidad (ΔE en OKLab), nunca dirección. Modos: Solo y Duelo hotseat, sin cuentas ni backend.

**Principio de arquitectura — "hotseat ahora, online sin reescritura":**

1. **Estado canónico = JSON puro.** Nada de refs, closures, `Map`/`Set`, clases en el estado (`GameState`). Debe sobrevivir a `stringify`/`parse` sin pérdida.
2. **Motor puro en `lib/engine.ts`.** Reducer `(state, action) => state`. Sin React, sin `window`, sin I/O, sin aleatoriedad sin seed, sin mutar argumentos. La derivación de color (API o canvas) ocurre en la UI *antes* de despachar `SUBMIT_CLUE`, ya resuelta.
3. **Jugadores como array con `id`.** El turno es un `playerId`, nunca un índice o "jugador 1/2" hardcodeado.
4. **La carta es derivable, no almacenada.** Se guarda `GridSpec` (seed + parámetros); `buildGrid(spec)` reconstruye la `Grid` determinísticamente — mismo spec siempre da misma grid.

**Módulos puros vs. con efectos** (contrato completo en SCHEMA §8):
- `lib/color.ts` — puro: conversiones sRGB ↔ OKLab ↔ OKLCH, `deltaE`
- `lib/grid.ts` — puro/determinista: PRNG con seed (mulberry32), `buildGrid`
- `lib/engine.ts` — puro: reducer + selectores (`bestGuess`, `scoreRound`, `isRoundOver`, `winner`)
- `lib/thermo.ts` — puro: mapea `closeness` → etiqueta/porcentaje de termómetro
- `lib/extract.ts` — cliente/DOM: color representativo de imagen vía canvas (media en luz lineal ponderada por croma)
- `lib/word-color.ts` — red: palabra → color vía IA, nunca lanza excepción, devuelve resultado tipado (`ok`/`reason`) + caché
- `lib/gsap.ts` — registro único de plugins GSAP + helper `prefersReducedMotion`

**Estructura de directorios objetivo** (post Sprint 0): `app/` (una sola ruta — el juego es modal, la fase vive en el estado, no en la URL), `components/screens/` (S0–S6), `components/game/`, `components/ui/`, `lib/`, `hooks/`, `tokens/theme.css`.

**Máquina de fases** (`GameState.phase`, ver SCHEMA §7):
```
home → setup → [curtain (solo duelo) →] playing → reveal → setup (más rondas) | scoreboard (duelo completo)
scoreboard → setup (REMATCH) | home (GO_HOME)
```

## Reglas de stack no negociables (de `START.md`)

**GSAP**
- `useGSAP()` de `@gsap/react` — nunca `useEffect` pelado
- `gsap.registerPlugin()` una sola vez, en `lib/gsap.ts`
- Animar solo `transform`, `opacity`, `clip-path`
- Toda animación tras `prefers-reduced-motion`, en CSS y en JS

**Color**
- OKLCH es el formato canónico; los hex son solo referencia
- `lib/color.ts` es puro: sin React, sin DOM, sin aleatoriedad
- Prohibido verde-éxito / rojo-error en cualquier parte de la UI. Único feedback cromático: el termómetro

**Estado**
- Estado canónico = JSON puro (sobrevive a `stringify`/`parse`)
- `lib/engine.ts` puro: `(state, action) => state`
- Jugadores como array con `id`; turno = `playerId`, nunca índice hardcodeado

**TypeScript**
- `strict: true`, `noUncheckedIndexedAccess: true`
- Cero `any` — si algo no tipa, se arregla el tipo, no se silencia

## Testing mínimo obligatorio (SCHEMA §11)

Cuatro/cinco pruebas cuyo fallo silencioso arruinaría la partida — no negociables:

| Test | Verifica |
|---|---|
| `color.roundtrip` | `hex → oklch → hex` estable en toda la rampa |
| `grid.deterministic` | Mismo `GridSpec` ⟹ misma `Grid`, 100 seeds |
| `grid.minStep` | Ningún par de vecinos por debajo de `MIN_STEP_L`/`MIN_STEP_C`, en las 3 dificultades × 4 tamaños |
| `engine.invariants` | Invariantes de `GameState` (SCHEMA §6) se mantienen tras cualquier secuencia de acciones |
| `engine.serializable` | `parse(stringify(state))` igual al original |

## Sprints (`MATIZ-SPRINTS.md`)

Orden secuencial estricto por dependencia: **S0** Fundación (setup, tokens OKLCH, `lib/color.ts`/`grid.ts`) → **S1** Bucle jugable (engine, UI de carta, solo) → **S2** Pantallas/navegación → **S3** Reveal (coreografía GSAP) → **S4** Duelo hotseat (mayor riesgo: estado multijugador nuevo) → **S5** Pulido/lanzamiento.

Puntos de corte válidos si falta tiempo: tras S2 (solitario publicable), tras S3 (recomendado — solitario con carácter, sirve como portfolio), tras S4 (MVP completo).
