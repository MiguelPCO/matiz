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

- **Names.** Run `bash $V ab find role button click --name "Duelo"`, `bash $V ab find label "Jugador 1" fill "Ana"`, `bash $V ab find label "Jugador 2" fill "Beto"`, `bash $V ab find role button click --name "Empezar duelo"`. Setup appears with radio `Palabra` checked and `Imagen` enabled.
- **Word clue.** Fill the clue textbox (placeholder `Palabra (p. ej. óxido)`): `bash $V ab find placeholder "Palabra (p. ej. óxido)" fill "óxido"`, then `bash $V ab find role button click --name "Revelar color"`. `Pista lista.`-style ready state shows a swatch and `Empezar` becomes enabled. Click `Empezar`.
- **Curtain.** `get text body` shows `TURNO DE` and the other player's name. Hold the control: `bash $V ab focus "[aria-label='Mantén pulsado']"`, `bash $V ab keyboard down Space` (or `press` held via `mouse down` on its box), wait past the hold duration, release. The grid appears.
- **Play to reveal.** Tap cells as in [Solo round](./solo-round.md) until the action button reads `Continuar`.
- **Second round.** Click `Continuar`, set a clue for the other player, pass the curtain, play until the action reads `Ver marcador`.
- **Scoreboard.** Click `Ver marcador`. Text shows both names, scores, and `Gana …` or `Empate perfecto.` Proof: `bash $V shot duelo/scoreboard`.
- **Rematch.** Click `Revancha`; the next screen is Setup for a new duel with the same names.

## Gotchas

- The curtain is press-and-hold (pointer down or Enter/Space held); a plain `click` releases immediately and does nothing. Not yet driven end to end; confirm the hold recipe on first run and update this file.
- `Imagen` needs a real image file: use `bash $V ab upload "input[type=file]" <abs path>`; the file input is hidden behind `Elegir imagen`.
- Size and difficulty lock after round 1 (same config for both players); per-player clue type does not.
- Each word clue costs one Claude call (`Revelar color`).
