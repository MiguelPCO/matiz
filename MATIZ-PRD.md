# MATIZ — PRD v1.0

> **Lee el color a ciegas.**
> Juego de percepción cromática. Web app. Solitario y duelo local.

| | |
|---|---|
| **Estado** | Dirección validada · prototipo solitario jugable |
| **Fase** | MVP v1 |
| **Fecha** | Julio 2026 |
| **Owner** | Miguel — Design Engineer |
| **Stack** | Next.js 15 · React 19 · TypeScript strict · Tailwind v4 (OKLCH) · GSAP |

---

## 1. Resumen ejecutivo

MATIZ es un juego de precisión cromática. El jugador recibe una **pista** —una palabra, o una fotografía vaciada a blanco y negro— y debe localizar su color exacto dentro de una **carta de calibración**: una rejilla N×N de tonalidades del mismo tono, ordenada por claridad e intensidad.

El bucle dura entre 60 y 90 segundos. El feedback es un **termómetro de proximidad** que informa de la cercanía en color pero nunca de la dirección; la dirección es un recurso de pago que cuesta puntos.

**Inspiración declarada:** *Hues & Cues* (juego de mesa). **Diferencia sustancial:** en el original la pista es verbal y humana; en MATIZ la pista es una imagen desaturada o una palabra interpretada por IA, y el espacio de color es un campo ordenado y medible en lugar de un tablero fijo.

### Por qué este proyecto

Doble propósito, y ambos importan:

1. **Producto:** un juego corto, rejugable y compartible, con una mecánica que no existe empaquetada así.
2. **Portfolio:** demuestra en una sola pieza el rango completo de Design Engineer — sistema de color en OKLCH, matemática de color perceptual, game feel, animación con criterio, arquitectura de estado e integración de IA.

---

## 2. Objetivos y métricas

### Objetivos del MVP

| # | Objetivo | Medida de éxito |
|---|---|---|
| O1 | El bucle central es satisfactorio sin explicación previa | Un jugador nuevo completa su primera ronda sin abrir S6 |
| O2 | El duelo local funciona sin filtración de información | Ningún tester ve el objetivo del rival por accidente |
| O3 | La pieza sostiene una conversación de portfolio | Se puede explicar una decisión técnica no trivial en 2 minutos |
| O4 | Rendimiento de producto real | LCP < 2,5 s · CLS < 0,1 · interacción táctil < 100 ms |

### No-objetivos del MVP

Declarados explícitamente para proteger el alcance:

- ❌ Multijugador **online** (arquitectura preparada, no implementada)
- ❌ Cuentas de usuario, login, perfiles
- ❌ Persistencia de partidas o histórico
- ❌ Modo Diario (visible como "pronto" en S0, sin funcionalidad)
- ❌ Modo claro / tema alternativo
- ❌ Internacionalización (español únicamente)
- ❌ Monetización de cualquier tipo

### Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El color derivado de una palabra no coincide con la intuición del jugador | Alto — rompe la confianza en el juego | Prompt orientado al color **prototípico** del objeto real. Caché de términos frecuentes. Fallback a modo imagen si la API falla |
| La extracción de color de imagen se "ensucia" con fondos dominantes | Medio — el objetivo no representa la foto | Media ponderada por croma (ya implementado). Mejora prevista: k-means |
| En dificultad alta las celdas resultan indistinguibles | Medio — frustra en vez de retar | Suelo de decidibilidad: ΔL ≥ 0,045 y ΔC ≥ 0,014 entre vecinos |
| Dependencia de red en el modo palabra | Bajo | Único punto de red del MVP. Diccionario local como fallback (post-MVP) |

---

## 3. Usuarios y contexto

**Perfil primario:** persona con interés por el color —diseño, fotografía, ilustración— que disfruta de juegos cortos de habilidad. Juega en móvil, en ratos sueltos.

**Perfil secundario:** dos personas en el mismo sitio buscando una partida rápida sin instalar nada (contexto del juego de mesa original).

**Perfil terciario:** reclutador o cliente evaluando el portfolio. No juega para ganar; juega para valorar la ejecución. La calidad del *primer minuto* es lo que le importa.

**Contexto de uso dominante:** móvil, una mano, sesión de 1–5 minutos. Esto justifica: mobile-first, zona de pulgar para las acciones, cero fricción de entrada y ausencia de cuentas.

---

## 4. Mecánica del juego

### 4.1 Bucle central

```
PISTA → LECTURA DE LA CARTA → TIRO → TERMÓMETRO → (repetir) → REVEAL
```

### 4.2 Derivación del color objetivo

**Modo imagen (100 % cliente):**
La imagen se redimensiona a 60×60 px en canvas. Se calcula la media de todos los píxeles opacos **en luz lineal**, ponderada por croma (peso `1 + (max−min)/60`), de modo que los píxeles saturados —el sujeto— pesan más que los grises de fondo. El resultado es el hex objetivo.

**Modo palabra (requiere red):**
Llamada a Claude solicitando el color más prototípico y reconocible del concepto: el del objeto o material real, no una lectura abstracta. Respuesta forzada a hex puro y validada por regex. Ante fallo: mensaje claro + reintento + sugerencia de modo imagen.

### 4.3 La carta de calibración

Rejilla N×N derivada del color objetivo en OKLCH, **con el tono (H) fijo**. Todas las celdas son tonalidades del mismo color.

- **Eje X (columnas):** luminosidad — oscuro (izq) → claro (der)
- **Eje Y (filas):** croma — vivo (arriba) → apagado (abajo)
- La posición del objetivo dentro de la carta es aleatoria
- La celda objetivo muestra el color exacto derivado

**Suelos de decidibilidad:** paso mínimo de 0,045 en L y 0,014 en C entre celdas vecinas. Garantiza que "Difícil" sea difícil de *decidir* y no imposible de *ver*.

### 4.4 Feedback: el termómetro

Tras cada tiro se calcula la **ΔE en OKLab** (distancia euclídea perceptual) entre la celda tocada y el objetivo, normalizada al ΔE máximo de la carta. Se expresa como cercanía `clo ∈ [0,1]`:

| Rango | Etiqueta | Barra |
|---|---|---|
| ≥ 0,965 | ¡Ahí es! | 100 % |
| ≥ 0,82 | Casi | 90 % |
| ≥ 0,55 | Cerca | 72 % |
| ≥ 0,30 | Templado | 46 % |
| < 0,30 | Lejos | ≥ 10 % |

**Regla de diseño innegociable:** el termómetro comunica **magnitud, nunca dirección**. La dirección es una pista de pago. Este trato es el corazón del juego: preserva la habilidad de leer color en lugar de convertirlo en una búsqueda binaria mecánica.

### 4.5 Pistas

Máximo 3 intentos por ronda. Pistas disponibles según dificultad, **−15 puntos cada una**:

| Pista | Qué revela | Condición |
|---|---|---|
| **Claridad** | Zona del eje X: oscuro / medio / claro | — |
| **Intensidad** | Zona del eje Y: apagado / medio / vivo | — |
| **Dirección** | Flecha desde el último tiro hacia el objetivo | Requiere ≥ 1 tiro |

### 4.6 Puntuación

```
score = max(0, base − penalizaciones)

base   = distancia Chebyshev del mejor tiro al objetivo
         0 → 100 · 1 → 60 · 2 → 30 · 3 → 12 · ≥4 → 0

penal. = (pistas × 15) + (max(0, tiros − 1) × 8)
```

### 4.7 Dificultad

| Nivel | Dispersión L | Dispersión C | Pistas |
|---|---|---|---|
| Fácil | 0,62 | 0,20 | 3 |
| Medio | 0,42 | 0,13 | 2 |
| Difícil | 0,26 | 0,08 | 1 |

Tamaños de carta: 4×4 · 5×5 · 6×6 · 8×8. Dificultad y tamaño son ortogonales: la primera controla cuánto se parecen los colores, el segundo cuántas opciones hay.

### 4.8 Modo Duelo (hotseat)

**El giro:** cada jugador **define la pista para el rival**, y adivina la que el rival definió para él. Quien pone la pista no juega esa ronda. Así el reto es leer el color de otra persona, no el propio — y no hay ventaja de turno.

**Desempate, por orden:** más puntos → menos pistas → menos tiros → mejor ΔE del mejor tiro.

---

## 5. Marca y sistema de diseño

### 5.1 Territorio

- **Nombre:** MATIZ — nombra exactamente lo que el juego pone a prueba
- **Esencia:** *afinar el ojo*
- **Metáfora rectora:** laboratorio de calibración / cámara oscura
- **Personalidad:** preciso, sobrio, curioso, con un punto nerd-juguetón. Instrumento, no juguete; nunca solemne
- **Tagline:** «Lee el color a ciegas.»
- **Anti-territorio:** ni arcoíris chillón, ni infantil, ni app-de-colores genérica

**Léxico propio** (la consistencia *es* la marca): la rejilla es **carta**; el objetivo es **matiz**; los modos son **Solo / Duelo / Diario**; la cercanía se mide con el **termómetro** y se expresa en **ΔE**.

**Voz:** concisa, técnica-cálida. Nunca regaña al jugador. Ante el fallo, la culpa es del color: *«Ese matiz engaña.»*

### 5.2 Color

**Principio funcional:** la interfaz no puede sesgar la lectura del color. El entorno es gris casi-neutro y **el color solo vive en los swatches**. No es una decisión estética: es la condición para poder juzgar color.

Rampa neutra — intención OKLCH `C ≈ 0,006 · H ≈ 255`:

| Token | Hex | Uso |
|---|---|---|
| `surface-0` | `#14161A` | Fondo — cámara oscura |
| `surface-1` | `#1E2024` | Panel |
| `surface-2` | `#292C31` | Carta / elevado |
| `line` | `#383C43` | Bordes |
| `text-faint` | `#666D77` | Micro-labels |
| `text-muted` | `#98A0AB` | Secundario |
| `text` | `#ECEEF1` | Primario |

**Acento único — safelight ámbar** `#E7A34B` (≈ `L 0,75 · C 0,13 · H 68`). Reservado a: objetivo, score, CTA primario y foco. Nada más lo toca.

**Decisión distintiva:** sin verde-éxito ni rojo-error. Colorearían la escena y sesgarían la lectura. El único feedback cromático es el termómetro; el acierto se marca con énfasis ámbar. **Instrumento, no semáforo.**

**Tema:** oscuro como primario y único del MVP.

### 5.3 Tipografía

**General Sans** (Fontshare) para interfaz y display · **Geist Mono** para datos.

| Rol | Fuente | Tamaño | Detalle |
|---|---|---|---|
| Display / wordmark | GS | 30 px | semibold · tracking −0,02em |
| Título de pantalla | GS | 20 px | medium |
| Cuerpo / botón | GS | 15 px | regular |
| Micro-label | Mono | 10 px | tracking 0,25em · MAYÚSCULAS |
| Dato | Mono | 12 px | tabular |
| Score | Mono | 32 px | bold · tabular |

**Regla de oro:** número medible o etiqueta de instrumento → mono. Lenguaje humano → sans. Sin excepciones; esa disciplina es la marca.

**Wordmark:** MATIZ en versalitas, tracking 0,35em. La «I» en ámbar — el punto de calibración. Área de reserva: la altura de una letra a cada lado.

---

## 6. Arquitectura de pantallas

| ID | Pantalla | Modo |
|---|---|---|
| S0 | Home | ambos |
| S1 | Setup | ambos |
| S2 | Cortina | solo Duelo |
| S3 | Juego | ambos |
| S4 | Reveal | ambos |
| S5 | Marcador | solo Duelo |
| S6 | Cómo se juega | ambos, opcional |

**Jerarquía:** S3 es la pantalla principal; todo lo demás existe para llegar a ella o cerrarla. **La carta nunca comparte protagonismo.**

**Navegación:** sin barra de pestañas — el juego es modal por naturaleza. Solo retroceso contextual arriba a la izquierda, que en S3 pide confirmación. «Cómo se juega» vive como icono discreto en S0 y S1.

**Ergonomía:** la carta se ancla al centro-alto; acciones y pistas en el tercio inferior. En S3 nada interactivo por encima de la carta salvo el retroceso.

### Flujo Solo

```
S0 ─[Solo]→ S1 ─[Empezar]→ S3 ⟳ tiro → termómetro → tiro
                                 ↓ acierto o 3er tiro
                               S4 ─[Otra ronda]→ S1   (conserva tamaño y dificultad)
                                  └─[←]────────→ S0
```

### Flujo Duelo

```
S0 ─[Duelo]→ S1  J1 define la pista PARA J2
                  ↓
                 S2  cortina · "Turno de J2"
                  ↓
                 S3  juega J2 → S4  su resultado
                  ↓
                 S2  cortina · "Turno de J1"
                  ↓
                 S1  J2 define la pista PARA J1 → S2 → S3 → S4
                  ↓
                 S5  marcador ─[Revancha]→ S1
                             └─[Home]────→ S0
```

---

## 7. Decisiones de UX críticas

### 7.1 Onboarding sin tutorial

**Principio:** la carta debe explicarse sola. Un modal explicativo es una confesión de que el diseño no comunica.

1. **Ejes rotulados permanentes** — `◀ OSCURO / CLARO ▶` y `VIVO ▲ APAGADO ▼`. No es tutorial: es rotulación de instrumento, presente también en la partida número 50
2. **La carta es su propia leyenda** — al estar ordenada, el ojo capta el sistema antes de leer nada
3. **Primer tiro guiado por ausencia** — antes del primer toque, el espacio del termómetro dice *«Toca el matiz que creas correcto.»* Enseña ocupando el hueco, no interrumpiendo
4. **La primera ronda es la más fácil** — 4×4 / Fácil / Palabra. Se aprende por éxito

**Regla dura: cero modales antes de la primera partida.**

### 7.2 Coreografía del Reveal

Es el clímax de la ronda. No es un panel: es una secuencia (≈ 1,6 s).

| t | Evento |
|---|---|
| 0,0 s | La carta se congela. Swatches no acertados → opacidad 35 % |
| 0,2 s | El objetivo se ilumina: anillo ámbar + escala 1 → 1,06 → 1 |
| 0,5 s | Línea punteada ámbar del mejor tiro al objetivo (`stroke-dashoffset`) |
| 0,8 s | **La foto se revela:** `grayscale(1) → (0)` en 900 ms. Si fue palabra, el swatch real crece junto a ella |
| 1,1 s | El score cuenta hacia arriba (ease-out cúbico) + háptico corto |
| 1,4 s | Entra el panel de acciones desde abajo |

**Regla:** el reveal de la foto es el pico. El score entra *después* para no competir.

**Jerarquía del resultado:** veredicto humano (sans) → puntuación (mono grande) → auditoría (`100 − 15`). Sentimiento, luego número, luego desglose.

**Microcopy:** exacto → «Clavado.» · anillo 1 → «A un matiz.» · anillo 2 → «Buen ojo.» · lejos → «Ese matiz engaña.»

**Accesibilidad:** todo tras `prefers-reduced-motion`. Sin motion, los estados finales aparecen de golpe sin pérdida de información.

### 7.3 La Cortina (S2)

**Problema:** J1 acaba de ver el color objetivo. Sin fricción, J2 podría ver restos en pantalla.

- **Corte a negro inmediato** al confirmar. Sin animación de salida: un corte seco es lo seguro
- **Identidad grande:** «Turno de Marta» en display, con su color de jugador
- **Desbloqueo deliberado:** mantener pulsado 1,2 s con anillo de progreso — no un botón, que se pulsa al pasar el móvil
- **La pista solo aparece tras el desbloqueo**, ya en S3. La cortina nunca muestra contenido de juego
- **Sin cuenta atrás:** un timer mete prisa justo cuando conviene calma

**Limitación honesta:** ningún diseño impide que J1 mire por encima del hombro. Eso es un pacto social, no un problema de software; el juego de mesa original tiene la misma condición. El objetivo es eliminar la filtración *accidental*.

**Identidad de jugadores:** colores tomados de la rampa neutra + ámbar, **nunca de la paleta de las cartas**, para evitar asociaciones falsas con el juego. Nombres editables con defaults J1/J2.

---

## 8. Requisitos técnicos

### 8.1 Arquitectura — preparada para online

Decidido: hotseat ahora, online como fase posterior **sin reescritura**. Cuatro reglas:

1. **Motor puro en `lib/engine.ts`** — reducer con funciones puras: `applyGuess`, `applyHint`, `nextTurn`, `scoreRound`. La UI solo despacha acciones
2. **Estado serializable (JSON)** — nada de refs ni closures en el estado canónico. Es lo que un día viajará por Supabase Realtime
3. **Jugadores como array con `id`** — el turno es un `playerId`, nunca «jugador 1/2» hardcodeado
4. **Carta determinista por seed** — generable desde una semilla, para que los clientes reconstruyan el mismo tablero sin transmitirlo entero

### 8.2 Módulos

| Módulo | Responsabilidad |
|---|---|
| `lib/color.ts` | sRGB ↔ OKLab ↔ OKLCH · ΔE · conversión hex. **Puro, sin React** |
| `lib/grid.ts` | Generación determinista de la carta desde seed |
| `lib/engine.ts` | Reducer del juego · scoring · pistas · turnos |
| `lib/extract.ts` | Color representativo de imagen (canvas) |
| `lib/word-color.ts` | Palabra → color vía API + caché + fallback |
| `components/ColorCard` | Carta, swatches, ejes, línea de reveal |
| `components/Thermometer` | Barra + etiqueta de cercanía |
| `components/ClueBar` | Pista en B/N o palabra + reveal a color |
| `components/Curtain` | Transferencia con mantener-pulsado |

### 8.3 Reglas de animación (no negociables del stack)

1. `useGSAP()` de `@gsap/react` — nunca `useEffect` pelado para GSAP
2. `gsap.registerPlugin()` centralizado en `lib/gsap.ts`
3. Animar solo `transform`, `opacity`, `clip-path`
4. Toda animación tras `prefers-reduced-motion`, en CSS y en JS

### 8.4 Accesibilidad

- Cada swatch es un `<button>` con `aria-label` de fila/columna
- Foco visible en ámbar sobre cualquier fondo de swatch
- Objetivo táctil ≥ 44 px en 4×4–6×6. En 8×8 el swatch es menor: se compensa con área de toque extendida
- **Consideración honesta:** MATIZ es un juego de discriminación cromática. No es accesible a daltonismo severo por su naturaleza. La rejilla monotono lo mitiga parcialmente (la luminosidad es un eje real y legible), pero debe declararse en lugar de fingir lo contrario

---

## 9. Alcance por sprints

| Sprint | Contenido | Estado |
|---|---|---|
| **S0** | Setup Next.js 15 · tokens OKLCH · fuentes · `lib/color.ts` | Pendiente |
| **S1** | Migración del prototipo: carta, termómetro, pistas, scoring | Lógica lista en prototipo |
| **S2** | Pantallas S0/S1/S6 · navegación · estados de carga y error | Pendiente |
| **S3** | Coreografía del Reveal (S4) con GSAP | Especificado |
| **S4** | Duelo hotseat: motor de turnos, cortina S2, marcador S5 | Especificado |
| **S5** | Pulido: háptica, accesibilidad, rendimiento, deploy | Pendiente |

**Post-MVP, por prioridad:**
1. **Modo Diario** — un matiz compartido al día + tarjeta de resultado compartible. Es la palanca de alcance real
2. k-means para extracción de color de imagen
3. Diccionario local de palabras cacheadas (menos dependencia de red)
4. Multijugador online (Supabase Realtime)
5. Tema claro «mesa de luz»

---

## 10. Definición de terminado (MVP)

- [ ] Un jugador nuevo completa su primera ronda sin abrir S6
- [ ] Solo y Duelo son jugables de principio a fin sin callejones sin salida
- [ ] El fallo de la API de palabra ofrece siempre una salida
- [ ] Toda animación respeta `prefers-reduced-motion`
- [ ] Core Web Vitals en verde en móvil real
- [ ] Cero `any` en TypeScript · `tsc --noEmit` limpio
- [ ] Desplegado en Vercel con dominio propio

---

## Anexo — Decisiones cerradas

Registro de lo ya decidido, para no reabrirlo:

| Decisión | Resolución |
|---|---|
| Generación de la carta | Campo ordenado 2D, **tono fijo** (tonalidades del mismo color) |
| Palabra → color | IA (Claude), con prompt de color prototípico |
| Alcance del Duelo | Hotseat en v1, **arquitectura preparada para online** |
| Feedback del tiro | Termómetro de magnitud. Dirección = pista de pago |
| Nombre | MATIZ |
| Tipografía | General Sans + Geist Mono (ruta A: carácter) |
| Acento | Ámbar único · sin verde/rojo semántico |
| Umbrales del termómetro | Validados en prototipo |
| Densidad de S3 | Validada en móvil |
