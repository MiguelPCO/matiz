# START.md — MATIZ

> Punto de entrada del proyecto. Si abres esto en frío —tú dentro de tres semanas, o Claude Code en una sesión nueva—, esto es lo primero que se lee.

---

## Qué es

**MATIZ** — juego de percepción cromática. Web app.
Recibes una pista (una palabra, o una foto en blanco y negro) y encuentras su color exacto en una carta de tonalidades.

**Tagline:** «Lee el color a ciegas.»
**Stack:** Next.js 15 · React 19 · TypeScript strict · Tailwind v4 (OKLCH) · GSAP.
**Alcance MVP:** solitario + duelo local (hotseat). Sin cuentas, sin online, sin backend.

---

## Documentos (leer en este orden)

| Doc | Para qué | Cuándo |
|---|---|---|
| `START.md` | Este archivo. Contexto y arranque | Cada sesión |
| `MATIZ-PRD.md` | Qué se construye y por qué | Antes de decidir nada de producto |
| `MATIZ-SCHEMA.md` | Tipos, contratos, tokens | Antes de escribir código |
| `MATIZ-SPRINTS.md` | Plan de ejecución | Al empezar cada sprint |
| `croma.jsx` | Prototipo validado. Lógica de referencia | Al portar la mecánica en S1 |

**Regla:** el PRD y el SCHEMA están cerrados. No se reabren durante la ejecución. Idea nueva → lista post-MVP.

---

## Estado actual

```
Fase:            Definición COMPLETA. Listo para Sprint 0.
Prototipo:       Jugable y validado (croma.jsx) — solitario.
                 Termómetro, tonalidades, dificultad y scoring confirmados en móvil.
Próximo paso:    Sprint 0 — Fundación.
```

### Decisiones cerradas

- Nombre: **MATIZ**
- Carta: campo ordenado 2D, **tono fijo** (tonalidades del mismo color)
- Palabra → color: **IA (Claude)**, prompt de color prototípico
- Duelo: **hotseat** en v1, arquitectura preparada para online
- Feedback: **termómetro** de magnitud; dirección = pista de pago
- Tipografía: **General Sans + Geist Mono**
- Acento: **ámbar único**, sin verde/rojo semántico
- Tema: **oscuro** único en el MVP

---

## Arranque en frío (cada sesión)

1. Lee el bloque **Estado actual** de arriba
2. Abre `MATIZ-SPRINTS.md` y localiza el sprint en curso
3. Coge la primera tarea **sin marcar** de ese sprint
4. Antes de escribir: comprueba el contrato en `MATIZ-SCHEMA.md`
5. Al terminar la tarea: marca el checkbox y actualiza el **Estado actual** de este archivo

**No empieces una tarea de un sprint si el anterior no está en verde.** El orden es por dependencia, no por preferencia.

---

## Comandos

```bash
pnpm dev            # desarrollo
pnpm build          # build de producción
pnpm test           # tests (los 5 obligatorios del SCHEMA §11)
pnpm tsc --noEmit   # comprobación de tipos — debe salir limpio siempre
```

---

## Reglas del stack (no negociables)

**GSAP**
1. `useGSAP()` de `@gsap/react` — nunca `useEffect` pelado
2. `gsap.registerPlugin()` una sola vez, en `lib/gsap.ts`
3. Animar solo `transform`, `opacity`, `clip-path`
4. Toda animación tras `prefers-reduced-motion`, en CSS y en JS

**Color**
- OKLCH es el formato canónico. Los hex son referencia; el valor de verdad es OKLCH
- `lib/color.ts` es puro: sin React, sin DOM, sin aleatoriedad
- Prohibidos verde-éxito y rojo-error. El único feedback cromático es el termómetro

**Estado**
- El estado canónico es JSON puro (sobrevive a `stringify`/`parse`)
- `lib/engine.ts` es puro: `(state, action) => state`. Sin I/O, sin `window`
- Jugadores como array con `id`. El turno es un `playerId`, nunca un índice hardcodeado

**TypeScript**
- `strict: true`, `noUncheckedIndexedAccess: true`
- Cero `any`. Si algo no tipa, se arregla el tipo, no se silencia

---

## Definición de terminado (MVP)

- [ ] Un jugador nuevo completa su primera ronda sin abrir «Cómo se juega»
- [ ] Solo y Duelo jugables de principio a fin, sin callejones sin salida
- [ ] El fallo de la API de palabra ofrece siempre una salida
- [ ] Toda animación respeta `prefers-reduced-motion`
- [ ] Core Web Vitals en verde en móvil real
- [ ] `tsc --noEmit` limpio, cero `any`
- [ ] Desplegado en Vercel con dominio propio

---

## Puntos de parada válidos

Si hay que cortar por tiempo, estos son los cortes limpios:

- **Tras S2** → solitario jugable y publicable
- **Tras S3** → solitario con carácter. Ya sirve como portfolio ← *recomendado si el tiempo aprieta*
- **Tras S4** → MVP completo

---

## El riesgo, en una frase

El riesgo de MATIZ **no es técnico** —la matemática difícil ya está resuelta y validada en el prototipo—, **es de alcance**. Ejecuta lo planificado. Las ideas nuevas esperan.
