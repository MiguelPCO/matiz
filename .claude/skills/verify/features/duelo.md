# Duelo hotseat

Two players share one device. Each sets a clue (word or image) for the other, a curtain hides the screen between turns, and after the rounds a scoreboard names the winner with a rematch option.

## Sub-features

- `duelo-names` Home `Duelo` reveals `Jugador 1` / `Jugador 2` textboxes, `Empezar duelo`, `Cancelar`.
- `duelo-clue-word` setter types a word, `Revelar color` shows the target swatch to the setter, then `Empezar`.
- `duelo-clue-image` setter picks a file with `Elegir imagen`; failure offers `Elegir otra imagen` / `Probar con palabra`.
- `duelo-curtain` `Turno de <NAME>` with a hold-to-confirm control `Mantén pulsado`.
- `duelo-reveal` Reveal action reads `Continuar`, then `Ver marcador` once two rounds exist.
- `duelo-scoreboard` per-player score, `N pistas · M tiros`, `Gana <name> — …` or `Empate perfecto.`, `Revancha`, `Inicio`.

## How to get to it (user POV)

- Home → `Duelo` → fill names → `Empezar duelo`.
- Scoreboard → `Revancha` (new duel, same players) or `Inicio`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index.

- **Names.** `bash $V ab find role button click --name "Duelo"`, then `bash $V ab snapshot -i` and fill the textboxes by ref: `bash $V ab fill @e2 "Ana"`, `bash $V ab fill @e3 "Beto"` (`find label … fill` and `find role textbox fill` both fail here). `bash $V ab find role button click --name "Empezar duelo"`. Setup appears with textbox `Pista para Beto` (empty names default to `J1`/`J2`).
- **Word clue.** Snapshot, `bash $V ab fill @<ref of "Pista para …"> "óxido"`, click `Revelar color`, wait ~4 s (Claude call), then `Empezar` is enabled. Click it.
- **Curtain.** `get text body` shows `TURNO DE` and the other player's name, nothing else. Hold with the mouse: `bash $V ab get box @<ref of "Mantén pulsado">`, `bash $V ab mouse move <center>`, `bash $V ab mouse down left`, `sleep 2`, `bash $V ab mouse up left`. Keyboard: focus it, `bash $V ab keydown Enter`, `sleep 2`, `bash $V ab keyup Enter`. The grid appears.
- **Play to reveal.** Tap cells as in [Solo round](./solo-round.md) until the action button reads `Continuar`.
- **Second round.** Click `Continuar`, set a clue for the other player, pass the curtain, play until the action reads `Ver marcador`.
- **Scoreboard.** Click `Ver marcador`. Text shows both names, scores, and `Gana …` or `Empate perfecto.` Proof: `bash $V shot duelo/scoreboard`.
- **Rematch.** Click `Revancha`; the next screen is Setup for a new duel with the same names.

## Gotchas

- The curtain is press-and-hold (pointer down or Enter/Space held); a plain `click` releases immediately and does nothing. Driven end to end 2026-10-16 with both recipes above. `keydown Space` in agent-browser sends an empty `key`, so the component ignores it; use `Enter` (real Space works for people).
- Rematch inverts who sets the first clue: round 1 of the first duel shows `Pista para Beto`, round 1 of the rematch `Pista para Ana`.
- `Imagen` needs a real image file: use `bash $V ab upload "input[type=file]" <abs path>`; the file input is hidden behind `Elegir imagen`.
- Size and difficulty lock after round 1 (same config for both players); per-player clue type does not.
- Each word clue costs one Claude call (`Revelar color`).
