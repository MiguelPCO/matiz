# Disclaimer de daltonismo alcanzable desde todas las pantallas

Sprint 5 · tarea «Declaración honesta sobre daltonismo en S6». Spec generado con `to-spec` (piloto Matt + pstack) tras una ronda de `grilling`.

## Problem Statement

La declaración honesta sobre daltonismo existe en S6 («Cómo se juega», sección «Sobre el daltonismo», commit `ed477a3`), pero S6 solo se abre desde Inicio y Setup. Quien llega por un enlace compartido a `/diario`, o quien ya está jugando una ronda, no tiene forma de abrir S6 ni de leer la declaración. Eso incumple el espíritu del PRD §8.4: declararlo en vez de fingir lo contrario.

## Solution

Botón `?` («Cómo se juega») en la cabecera de Play (cubre Solo y Duelo) y de Diario, igual que en Inicio y Setup: mismo componente S6, mismo `aria-label`, mismo estilo y posición (tras tema y perfil). El texto del disclaimer no cambia.

## User Stories

1. Como jugador que entra por un enlace a Diario, quiero abrir «Cómo se juega» desde Diario, para entender el juego y su límite con el daltonismo sin pasar por Inicio.
2. Como jugador daltónico, quiero encontrar la declaración honesta en cualquier pantalla de juego, para decidir si MATIZ es para mí.
3. Como jugador a mitad de ronda (Solo o Duelo), quiero repasar las reglas sin perder la ronda, para seguir jugando con contexto.
4. Como usuario de teclado o lector de pantalla, quiero que el botón tenga el mismo nombre accesible («Cómo se juega») en todas las pantallas, para reconocerlo.
5. Como usuario de teclado, quiero que S6 atrape el foco y se cierre con Escape también desde Play y Diario, igual que desde Inicio.

## Implementation Decisions

- Se reutiliza el overlay S6 tal cual; no es una fase de `GameState` (SCHEMA §7), sigue siendo estado local de la pantalla que lo abre.
- Play y Diario ganan un estado local `howToPlayOpen` y el mismo botón circular `?` que Setup.
- En Play el botón se oculta junto a tema y perfil mientras se confirma la salida (comportamiento actual de la cabecera).
- Abrir S6 no despacha acciones al motor: la ronda en curso no cambia.
- Texto del disclaimer sin cambios: «ayuda, pero no lo resuelve» sigue siendo cierto con el rango de L recortado de Diario.

## Testing Decisions

- Sin tests unitarios: no hay seam de DOM en el repo (vitest cubre solo `lib/`) y el cambio no toca lógica pura. `tdd` no aplica.
- Prueba con el skill `/verify` (feature `home-chrome`, sub-feature `chrome-howto`), extendido a Play y Diario: abrir `Cómo se juega` en cada pantalla, ver el texto «Sobre el daltonismo», cerrar con `Cerrar` y con Escape, y comprobar que la ronda sigue en el mismo estado.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde.

## Out of Scope

- Cambiar el texto del disclaimer o añadir un modo para daltónicos.
- Mostrar S6 automáticamente la primera vez (PRD O1: la primera ronda debe completarse sin abrir S6).
- Pantallas Curtain y Scoreboard (sin cabecera de controles hoy).

## Further Notes

- Marcar la casilla del Sprint 5 en `MATIZ-SPRINTS.md` al terminar.
- Piloto: `to-tickets` y `tdd` no aportan en un cambio de UI de un solo ticket; se registra en la retro.
