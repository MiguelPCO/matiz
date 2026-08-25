# MATIZ — SPRINTS v1.0

> Plan de ejecución del MVP. Seis sprints, secuenciales por dependencia.
> Cada sprint termina en algo **demostrable**, no en «código escrito».

---

## Lógica del orden

El orden no es arbitrario. Tres reglas lo gobiernan:

1. **La lógica pura antes que la interfaz.** `color` y `grid` son la base de todo lo demás y son testeables sin pintar un píxel. Si están mal, todo lo que se construya encima está mal.
2. **Jugable antes que bonito.** Al final del S2 el juego se puede jugar de principio a fin. El pulido va después, sobre algo que ya funciona.
3. **El Duelo después del Reveal.** El duelo *reutiliza* la coreografía del reveal. Construirlo antes obligaría a rehacerlo.

**Riesgo de secuencia:** el sprint 4 (Duelo) es el único que introduce complejidad de estado nueva. Si algo se desvía, se desvía ahí — por eso va después de que todo lo demás esté cerrado.

---

## Sprint 0 — Fundación

**Objetivo:** el proyecto existe, con el sistema de diseño y la matemática de color funcionando y probada.

### Tareas

- [ ] `create-next-app` — Next.js 15, React 19, TypeScript strict, Tailwind v4, App Router
- [ ] `tsconfig`: `strict: true`, `noUncheckedIndexedAccess: true`
- [ ] Fuentes: General Sans (Fontshare) + Geist Mono, con `display: swap` y preconnect
- [ ] `tokens/theme.css` con la rampa OKLCH del SCHEMA §10
- [ ] Script Python de cómputo de tokens (reutilizar el del workspace)
- [ ] `lib/types.ts` — todos los tipos del SCHEMA
- [ ] `lib/color.ts` — conversiones + `deltaE`
- [ ] `lib/grid.ts` — `rng` (mulberry32) + `buildGrid` determinista
- [ ] Tests: `color.roundtrip`, `grid.deterministic`, `grid.minStep`
- [ ] Repo en GitHub + proyecto en Vercel conectado

### Aceptación

- `tsc --noEmit` limpio, cero `any`
- Los tres tests en verde
- Una página en blanco desplegada en Vercel con las fuentes cargando correctamente

**Riesgo:** las conversiones OKLCH son la pieza donde un error se propaga en silencio a todo el juego. Por eso el test de ida y vuelta es innegociable.

---

## Sprint 1 — El bucle jugable

**Objetivo:** una ronda de solitario completa, sin adornos.

### Tareas

- [ ] `lib/engine.ts` — reducer con `START_SOLO`, `SUBMIT_CLUE`, `GUESS`, `REQUEST_HINT`
- [ ] Selectores: `bestGuess`, `scoreRound`, `isRoundOver`
- [ ] `lib/thermo.ts` con los umbrales validados
- [ ] `lib/extract.ts` — color representativo de imagen
- [ ] `lib/word-color.ts` — API + caché + resultado tipado sin excepciones
- [ ] `hooks/useGame.ts` — `useReducer` + contexto
- [ ] `components/game/ColorCard` + `Swatch` — carta, ejes rotulados, área táctil
- [ ] `components/game/Thermometer`, `ClueBar`, `HintRow`
- [ ] Pantalla S3 funcional
- [ ] Tests: `engine.invariants`, `engine.serializable`

### Aceptación

- Se juega una ronda completa: pista → tiros → termómetro → pistas → fin
- El termómetro responde con los mismos valores que el prototipo validado
- El estado sobrevive a `stringify`/`parse`
- **El motor no importa React en ninguna línea**

**Nota:** la lógica ya está resuelta y probada en el prototipo `croma.jsx`. Este sprint es sobre todo **portar y estructurar**, no inventar. La disciplina aquí es la separación motor/UI.

---

## Sprint 2 — Pantallas y navegación

**Objetivo:** el juego se puede jugar de principio a fin sin callejones sin salida.

### Tareas

- [ ] S0 Home — tres modos, «Diario» bloqueado, tira de calibración decorativa
- [ ] S1 Setup — pista, tamaño, dificultad; primera partida en 4×4/Fácil/Palabra
- [ ] S6 Cómo se juega — accesible desde S0 y S1, nunca automática
- [ ] Transiciones de fase según SCHEMA §7
- [ ] `components/ui/` — `Segmented`, `Button`, `Label`
- [ ] Estados de carga: «Revelando color…» en modo palabra
- [ ] Estados de error: fallo de API con reintento **y** salida a modo imagen
- [ ] Estados vacíos: CTA inerte sin pista; invitación antes del primer tiro
- [ ] «Otra ronda» → S1 conservando tamaño y dificultad
- [ ] Retroceso contextual; en S3 con confirmación
- [ ] Metadata + Open Graph

### Aceptación

- Cero rutas muertas: desde cualquier pantalla se puede volver o avanzar
- El fallo de la API **siempre** ofrece una salida
- Un jugador nuevo completa su primera ronda sin abrir S6 ← *objetivo O1 del PRD*

---

## Sprint 3 — El Reveal

**Objetivo:** la ronda termina en un momento, no en un panel.

### Tareas

- [x] `lib/gsap.ts` — registro único de plugins + helper de reduced-motion
- [x] Coreografía completa según PRD §7.2 (timeline de 1,6 s)
- [x] Atenuación de swatches no acertados al 35 %
- [x] Anillo ámbar + pulso de escala en el objetivo
- [x] Línea punteada del mejor tiro al objetivo — implementada como `<div>` rotado con `transform: scaleX`, no `stroke-dashoffset` (ver nota de conflicto abajo)
- [x] Revelado de la foto — implementado como cross-fade de `opacity` entre dos `<img>` apiladas, no `filter: grayscale()` animado (ver nota de conflicto abajo)
- [x] Contador de score ascendente, ease-out cúbico
- [x] Microcopy por resultado (los cuatro veredictos)
- [x] Háptica: patrón corto al fallar, triple al acertar — el discriminador usa `best.ring <= 1` (Clavado o A un matiz), no `Round.status`
- [x] **Rama `prefers-reduced-motion`: estados finales sin animación, sin pérdida de información**

### Aceptación

- [x] La secuencia respeta el orden: foto primero, score después
- [x] Con reduced-motion activo no se pierde ni un dato
- [x] Solo se animan `transform`, `opacity` y `clip-path`
- [x] Ningún `useEffect` pelado para GSAP; todo con `useGSAP()`

**Nota — conflicto §7.2 vs §8.3, resuelto:** §8.3 prohíbe animar `filter`/`stroke-dashoffset` (solo `transform`/`opacity`/`clip-path`, regla "no negociable" de rendimiento), pero la redacción literal de §7.2 describe la foto como `grayscale(1)→(0)` y la línea como algo que evoca SVG. Se tomó §8.3 como autoridad: la foto es un cross-fade de `opacity` entre dos `<img>` apiladas (B/N estática debajo, color encima), y la línea es un `<div>` con `border-top` punteado animado solo con `scaleX`. Mismo resultado visual, cero propiedades no permitidas. Detalle completo en `docs/superpowers/specs/2026-08-19-sprint3-reveal-design.md`.

---

## Sprint 4 — Duelo hotseat

**Objetivo:** dos personas, un móvil, sin filtraciones.

**Es el sprint de mayor riesgo:** introduce estado multijugador, turnos y una pantalla nueva.

### Tareas

- [ ] Extender el reducer: `START_DUEL`, `UNLOCK_CURTAIN`, `NEXT`, `REMATCH`
- [ ] Rotación de turnos por `playerId` (nunca por índice hardcodeado)
- [ ] S1 en modo duelo: «define la pista **para** el rival»
- [ ] S2 Cortina — corte a negro seco, identidad grande, sin contenido de juego
- [ ] `components/ui/HoldToConfirm` — mantener pulsado 1,2 s con anillo de progreso
- [ ] S5 Marcador — comparativa, desglose de pistas, desempate visible
- [ ] Lógica de desempate: puntos → pistas → tiros → ΔE
- [ ] Nombres editables con defaults J1/J2
- [ ] «Revancha» conserva jugadores y ajustes, invierte quién empieza

### Aceptación

- Un duelo completo sin que ningún tester vea el objetivo del rival ← *objetivo O2 del PRD*
- La cortina no muestra jamás contenido de juego
- Las invariantes de duelo del SCHEMA §6 se mantienen
- El desempate se resuelve y **se explica** en pantalla

---

## Sprint 5 — Pulido y lanzamiento

**Objetivo:** producto terminado, no prototipo avanzado.

### Tareas

- [ ] Accesibilidad: `aria-label` por swatch, foco visible en ámbar sobre cualquier fondo
- [ ] Objetivos táctiles ≥ 44 px; área extendida en 8×8
- [ ] Recorrido completo por teclado
- [ ] Rendimiento: LCP < 2,5 s, CLS < 0,1, interacción < 100 ms
- [ ] Prueba en móvil real (no solo DevTools) — iOS y Android
- [ ] Declaración honesta sobre daltonismo en S6
- [ ] Vercel Analytics + Web Vitals
- [ ] Dominio propio + OG image
- [ ] README con las decisiones técnicas (materia prima del caso de portfolio)

### Aceptación

- Los seis puntos de la Definición de Terminado del PRD §10
- Core Web Vitals en verde sobre dispositivo real

---

## Sprint 6 — Modo Diario

**Objetivo:** un matiz compartido al día, jugable y compartible, sin tocar el motor de Solo/Duelo.

### Tareas

- [x] `lib/daily.ts` — `localDateKey`, hash FNV-1a → seed, `buildDailyGridSpec` (rango curado L∈[0.4,0.72]/C∈[0.06,0.16])
- [x] `lib/daily.ts` — `buildShareText`, tarjeta de resultado estilo Wordle
- [x] `hooks/useDaily.ts` — `useReducer` propio, sin tocar `useGame`/`lib/engine.ts`; GUESS/REQUEST_HINT espejan `applyGuess`/`applyHint`
- [x] Persistencia `localStorage["matiz-daily-v1"]` — un resultado por día, sin histórico
- [x] `components/game/Reveal.tsx` — `clue` opcional (aditivo, Solo/Duelo sin cambios)
- [x] `app/diario/page.tsx` + `components/screens/Diario.tsx` — sin `ClueBar`, sin panel de pista
- [x] `components/screens/Home.tsx` — Diario desbloqueado

### Aceptación

- Home → Diario → jugar una ronda → Reveal sin panel de pista → compartir/copiar resultado
- Recargar la página cachea el resultado del día (bloquea replay); un día distinto permite jugar de nuevo
- Cero cambios en `lib/engine.ts`

---

## Resumen de dependencias

```
S0 Fundación
   └─▶ S1 Bucle jugable
          └─▶ S2 Pantallas ──▶ S3 Reveal
                                 └─▶ S4 Duelo
                                        └─▶ S5 Pulido
                                               └─▶ S6 Diario
```

**Puntos de parada válidos** — si hay que cortar por tiempo, estos son los cortes limpios:

| Tras… | Qué tienes |
|---|---|
| S2 | Un solitario jugable y completo. Publicable |
| S3 | Un solitario **con carácter**. Ya sirve como pieza de portfolio |
| S4 | El MVP funcional al completo |

**Recomendación:** si el tiempo aprieta, corta después de S3 y publica. Un solitario pulido comunica más competencia que un duelo a medio terminar.

---

## Post-MVP, por prioridad

1. k-means para extracción de color de imagen
2. Diccionario local de palabras cacheadas — reduce la dependencia de red
3. Multijugador online (Supabase Realtime) — la arquitectura ya lo contempla
4. Tema claro «mesa de luz»

---

## Deuda técnica conocida

**`lib/grid.ts` — el objetivo puede delatarse por contraste de croma en targets saturados (mayormente cerrado en un caso, mejorado pero sin resolver en el otro).**

Detectado probando S3 en navegador (Sprint 1, 2026-08-19) con `#e7a34b` en facil/4×4 y dificil/8×8 — no es un caso límite, se reproduce en ambos. Cuando el croma del target (`C0`) ya supera lo que el gamut sRGB admite en las columnas de luminosidad más extremas de la carta (habitual para cualquier color medianamente saturado, ya que `spreadL` empuja alguna columna cerca de blanco o negro), la fila del objetivo entera se desplaza (`shiftC`) para caber en gamut — pero la celda objetivo siempre muestra su hex exacto sin desplazar (regla de SCHEMA §4.3), así que queda muy por encima del resto de su fila. Resultado: la carta se ve casi monocroma salvo una celda evidente.

Se intentó fijar la fila del objetivo en `C0` (sin `shiftC` por gamut) — **empeora mucho**: sin el desplazamiento previo, muchas filas cercanas al extremo vívido superan el gamut individualmente y la salvaguarda por celda (`toInGamutOklab` en `oklchToHex`) las recorta *a cada una por su cuenta*, colapsando varias filas distintas al mismo croma límite. Violaciones de decidibilidad medidas: 110/2400 (línea base) → 3492/2400 (fix ingenuo) → 3145/2400 (fix con paso asimétrico por headroom real desde `tr`). Revertido a la línea base.

**Fix aplicado (pre-Sprint-6, 2026-08-23), resultado real medido — no el titular optimista inicial:** la hipótesis de tocar el eje L se implementó — `lStep` ya no se fija solo por dificultad/tamaño; se encoge hacia `MIN_STEP_L` cuando `C0` lo pide, acercando las columnas extremas a `L0` antes de recurrir a `shiftC`. Medido específicamente sobre los dos casos que este debt note reporta (`#e7a34b`, 30 seeds cada uno):
- **facil/4×4: mejora real** — mean `|shiftC|` 0.1057 → 0.0674 (~36%)
- **dificil/8×8: sin cambio** — mean `|shiftC|` 0.0885 → 0.0885, idéntico. Cada seed en esa combinación ya estaba limitado por gamut en `L0` mismo (el mejor caso posible), donde `lStep` no tiene nada que ajustar.

Renderizando facil/4×4 seed 4 (el peor de la muestra) tras el fix, el objetivo **sigue** visualmente evidente contra una fila de neutros apagados — el bug reportado no está cerrado, solo parcialmente mitigado en un subconjunto de casos. Se mantiene igualmente porque es más correcto matemáticamente y no regresa nada (suite completa en verde). Tests que clavan estos dos números exactos en `lib/grid.test.ts` (`grid.gamutFit`), para que una regresión futura se note de inmediato.

**Segundo fix aplicado (Sprint 6, 2026-08-25), reportado por Miguel probando "manzana" en vivo:** el residuo de arriba no era solo el hueco de gamut en `L0` — `affordableCStep` se calculaba como `(gamutCeiling-C_MIN)/(size-1)`, un rango simétrico que ignora que `C0` está clavado en la fila `tr` (nunca se desplaza). El paso real que cabe sin `shiftC` es asimétrico desde ese punto fijo: `min((gamutCeiling-C0)/tr, (C0-C_MIN)/(size-1-tr))`. Con ese bound, `shiftC` colapsa a 0 exactamente en la mayoría de casos (matemáticamente: `maxRawC ≤ gamutCeiling` y `minRawC ≥ C_MIN` quedan garantizados por construcción), no solo se reduce. No toca `cfg.spreadC`/`DIFFICULTY` — es una corrección del cálculo de `cStep` por carta, no una decisión de balance. Medido igual que el fix anterior (`#e7a34b`, 30 seeds):
- **facil/4×4:** mean `|shiftC|` 0.0674 → **0.0258** (~62% adicional; ~76% acumulado sobre la línea base 0.1057). 4/30 seeds quedan en `shiftC` exactamente 0.
- **dificil/8×8:** mean `|shiftC|` 0.0885 → **0.0761** (~14%). Ningún seed llega a 0 — la fila es larga (8 celdas) y `C0` casi siempre cae lejos de un extremo, así que el denominador (`tr` o `size-1-tr`) sigue siendo grande y el bound sigue estrecho.
- Violaciones de decidibilidad (los 3 difficulty × 4 sizes × 50 seeds del test `grid.decidable`, no solo `#e7a34b`): 110 → **41**. Mejora general, no solo en el caso saturado — el bound anterior también era laxo en casos no reportados.

Tests re-clavados en `lib/grid.test.ts` (`grid.gamutFit`) con los números reales medidos arriba, no optimistas.

**Verificación en vivo tras el fix (Miguel, "manzana" en medio/6×6):** el objetivo seguía visible en la carta renderizada — no es un caso aislado. Medido aparte (`#b41919`, rojo saturado similar, 100 seeds): medio/6×6 nunca llega a `shiftC` 0 (0% de los seeds), mean `|shiftC|` 0.046. facil/6×6 con el mismo hex sí cierra en el 19% de los seeds. El fix reduce el residuo en todas las combinaciones probadas, pero **no lo cierra** para rojos muy saturados en tamaños ≥6 — el mismo fenómeno estructural que dificil/8×8, solo que aparece antes (a partir de 6×6, no solo 8×8) cuando el target es muy vívido.

**Residuo que sigue sin cerrar (estructural, no un bug):** cuando incluso el paso posicional mínimo (`ABSOLUTE_MIN_STEP_C`) no cabe — target ya contra la pared del gamut, o fila larga con `tr` lejos de ambos extremos (el caso dificil/8×8 de arriba) — el `shiftC` residual vuelve a activarse como fallback. Cerrarlo del todo para dificil/8×8 exigiría encoger `spreadC` por dificultad para targets saturados — decisión de balance de juego que reabre la tabla `DIFFICULTY` (PRD cerrado), fuera de alcance de un fix de gamut puntual. Diferido, requiere su propio brainstorm si se decide perseguir.

**Tercer fix aplicado (Sprint 6, 2026-08-25), reposicionamiento en vez de encogimiento:** en vez de seguir absorbiendo el residuo vía `shiftC`, se invirtió el orden — `buildGridLattice` ahora elige la posición del target (`tr`, `tc`) entre las posiciones donde la carta completa ya encaja en gamut sin desplazar nada (`findFeasiblePositions`, `lib/grid.ts`), en vez de fijarla por RNG puro antes de saber nada del color. Cuando ninguna posición sirve, cae exactamente al comportamiento anterior (best effort, sin regresión). No toca `cfg.spreadL`/`cfg.spreadC`/`DIFFICULTY`.

Medido (ver spec `docs/superpowers/specs/2026-08-25-grid-target-reposition-design.md` para la tabla completa):
- **Cierra al 100% varios casos reales:** facil/4×4 `#e7a34b` (antes mean\|shiftC\| 0.026), medio/8×8 con "morado" y "oro" (los colores exactos que Miguel reportó en vivo) — `shiftC` y `shiftL` exactamente 0 (dentro de tolerancia de punto flotante, 1e-9) en las 30 seeds probadas en cada caso.
- **Fallback general sobre la muestra estándar (10 hex × 4 tamaños × 3 dificultades × 50 seeds): 1.7%** (10/600) — la mayoría de partidas reales generan una carta totalmente limpia ahora.
- **NO cierra el residuo para saturación extrema:** dificil/8×8 `#e7a34b`, "fucsia" en medio/5×5, y el rojo tipo manzana original en medio/6×6 (los otros dos casos que Miguel reportó en vivo) siguen en fallback el 100% de las veces, con el mismo residuo medido de sesiones anteriores — confirmado analíticamente que `findFeasiblePositions` devuelve el set vacío para estos: ni encogiendo `cStep` hasta `ABSOLUTE_MIN_STEP_C` cabe la fila en ninguna posición del tamaño elegido. No es una limitación del algoritmo de búsqueda — es que el gamut sRGB es angosto para magenta/rojo muy saturado en casi todo rango de luminosidad.
- `grid.decidable`: 41 → 33 violaciones (cap 130 sin cambio) — mejora, no regresión.

**Decisión explícita con Miguel:** se implementa así de todas formas — mejora real, gratuita en dificultad, para la mayoría de casos — y el cierre completo para saturación extrema sigue diferido (encogería `spreadC`, reabriendo `DIFFICULTY`, PRD cerrado). No se persigue en este trabajo.

**`hooks/useDaily.ts` duplica a mano las fórmulas de puntuación de `lib/engine.ts`.** `applyDailyGuess`/`applyDailyHint` copian línea por línea `applyGuess`/`applyHint` (documentado en el comentario de cabecera de ambos archivos) porque esas dos funciones no están exportadas y están atadas a la forma de `GameState`, no de `Round`. Un cambio futuro en la fórmula de puntuación o de pistas de Solo/Duelo tiene que acordarse de tocar también `useDaily.ts`, o Diario divergerá en silencio de Solo/Duelo. Sin test de contrato entre los dos que lo impida hoy.

---

## Nota de método

El PRD y el SCHEMA ya están cerrados. Durante los sprints, **las decisiones no se reabren**: si aparece una idea nueva —un modo, una mecánica, una integración—, va a una lista de post-MVP y se ejecuta lo planificado.

Esto es deliberado: el riesgo de este proyecto no es técnico, es de alcance. La lógica difícil ya está resuelta y validada en el prototipo. Lo que queda es ejecución disciplinada.
