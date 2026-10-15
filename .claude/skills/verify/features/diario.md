# Diario

One shared color per calendar date, same for everyone. The player gets one game a day; afterwards they see a verdict, streak stats and a month calendar, and can copy a shareable result. The word label for the day's color arrives from Claude after load and is decorative.

## Sub-features

- `diario-load` `/diario` shows `Cargando el matiz de hoy…` then the grid.
- `diario-clue` a `PISTA` word appears once `/api/color-word` answers; the game works without it.
- `diario-play` guess with thermometer and hints, same as Solo.
- `diario-once` after finishing, reload keeps today's result instead of a new game.
- `diario-stats` `Racha`, `Mejor`, `Victorias`, `Partidas`, calendar with `Mes anterior` / `Mes siguiente`.
- `diario-share` `Compartir resultado` copies text and flips to `Copiado`.
- `diario-sync` signed-in users sync history to Supabase (needs Google login; see Gotchas).

## How to get to it (user POV)

- Home → `Diario` link.
- Direct URL `/diario`. Back with `Volver` (top-left) or `Volver a inicio`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index, with `localStorage` cleared so today is unplayed.

- **Open.** Run `bash $V ab open http://localhost:4000` and `bash $V ab find role link click --name "Diario"`. URL is `/diario`; wait until `snapshot -i` lists `Fila 1, columna 1`.
- **Play.** Tap cells until `Compartir resultado` appears. Save `bash $V ab get text body > .verify/artifacts/diario/result.txt`; it shows a verdict and the stat labels `Racha`, `Partidas`.
- **Persisted.** Run `bash $V ab eval "localStorage.getItem('matiz-daily-history-v1')"`. It returns JSON containing today's date.
- **Once a day.** Run `bash $V ab reload`. The result and stats show again, no fresh grid to play. Proof: `bash $V shot diario/after-reload`.
- **Share.** Run `bash $V ab find role button click --name "Compartir resultado"`. The label becomes `Copiado`.

## Gotchas

- The date is the browser's local date; runs around midnight can flip to a new day mid-run.
- Clearing `localStorage` resets history; never do it in the user's own browser, only in the `matiz-verify` session.
- Clipboard writes can be blocked in headless mode; if the label stays `Compartir resultado`, report it with `ab errors` rather than calling it passed.
- `diario-sync` needs a real Google login through Supabase. The agent must not enter credentials; mark it unverified unless the user signs in themselves.
