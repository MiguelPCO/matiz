# Solo round

A solo player picks grid size and difficulty, gets a random word clue, taps cells in a same-hue grid until the round ends, sees the target and a score, and can play another round.

## Sub-features

- `solo-setup` size (`4×4`…`8×8`) and difficulty (`Fácil`/`Medio`/`Difícil`) radios; `Imagen` clue type is disabled in Solo.
- `solo-clue` entering Setup fetches a random word clue (Claude); `Empezar` stays disabled until `Pista lista.` shows. The target swatch is never shown before play.
- `solo-guess` each tap shows a thermometer word (e.g. `TEMPLADO`) and never a direction.
- `solo-hints` `Claridad · −15`, `Intensidad · −15`, `Dirección · −15` (Dirección disabled until the first guess).
- `solo-reveal` round end shows a verdict (`Clavado.`, `A un matiz.`, `Buen ojo.`, `Ese matiz engaña.`), score with penalty breakdown (`60 − 16`), target ringed.
- `solo-next` `Otra ronda` returns to Setup with the same config.

## How to get to it (user POV)

- Home → `Solo` → Setup → `Empezar`.
- From Reveal, `Otra ronda`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `doctor` reports `.env.local loaded` (the clue needs the Anthropic key).

- **Open Setup.** Run `bash $V ab open http://localhost:4000`, `bash $V ab set viewport 390 844` and `bash $V ab find role button click --name "Solo"`. Snapshot shows radios `4×4` (checked), `Fácil` (checked), `Palabra` (checked), `Imagen` (disabled) and button `Empezar`.
- **Wait for clue.** Run `bash $V ab wait --text "Pista lista."`. `snapshot -i` now shows `Empezar` enabled (it was `[disabled]` while `Generando pista…`).
- **Start.** Run `bash $V ab find role button click --name "Empezar"` and `bash $V ab wait --text "Toca el matiz"`. `get text body` shows `PISTA` followed by a Spanish word and `Toca el matiz que creas correcto.`
- **Guess.** Run `bash $V ab find role button click --name "Fila 2, columna 3"`. `get text body` now shows a thermometer word in place of the instruction. Save it: `bash $V ab get text body > .verify/artifacts/solo-round/guess.txt`.
- **Hint.** Run `bash $V ab find role button click --name "Claridad · −15"`. That button's label changes to the hint text and it becomes disabled.
- **Finish.** Keep tapping different cells until `get text body` contains `Otra ronda` (max 3 guesses). Run `bash $V ab wait 1500` so the score count-up finishes. Reveal shows a verdict, the score and, when hints were used, `base − penalty`. `bash $V ab get count "[data-target]"` returns `1`.
- **Proof.** Run `bash $V shot solo-round/reveal` and `bash $V ab get text body > .verify/artifacts/solo-round/reveal.txt`.
- **Next round.** Run `bash $V ab find role button click --name "Otra ronda"`. Run `bash $V ab wait --text "Pista lista."`; Setup is back with the same radios checked and a new clue ready.

## Gotchas

- Clicking `Empezar` while it is disabled reports `Done` but does nothing; always `wait --text "Pista lista."` first. This bit the first generated run.
- `ab wait <css selector>` can hit a socket timeout (os error 10060) on Windows; prefer `wait --text`.
- If the clue fetch fails, Setup shows an error copy and `Reintentar`; that is a failure of `solo-clue`, report it with `.verify/run/dev.log`.
- The number of taps before the round ends depends on difficulty; loop until `Otra ronda`, don't hardcode a count.
- Reading `[data-target]` before the reveal is cheating the proof; it is only present after round end anyway.
- Score counts up with an animation; text read right at reveal shows `0`. Wait, then read.
- Penalty: `−15` per hint, `−8` per guess after the first. A hint that did not register shows up as a missing `−15`.
- Each round costs one Claude call; the clue routes rate-limit at 20/min per IP.
- Touch targets: every control has a ≥ 44 px hit area (`hit-44` utility in `app/globals.css`; swatches extend 2 px into the gap). Check edges with `document.elementFromPoint` on a cell's inner border: it must return that cell, never its neighbour.
- Reduced motion: `bash $V ab set media light reduced-motion` before `open`; the reveal must show verdict, score and breakdown with no animation. Reset with `bash $V ab set media light`.
