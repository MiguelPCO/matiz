# MATIZ verification map

Maintained source for verifying what a MATIZ player can see and do. Read this index first, then use the matching feature file as the recipe.

## Baseline preconditions

- `bash .claude/skills/verify/matiz-verify.sh up` has printed `ready`, and `doctor` exits 0.
- The browser is the isolated `matiz-verify` agent-browser session, opened on `http://localhost:4000`, with `bash $V ab set viewport 390 844` applied.
- Fresh session storage: run `bash $V ab eval "localStorage.clear()"` then `bash $V ab reload` before any Diario recipe.
- Never drive an instance this run did not start.

## Driving conventions

- Start each recipe from `/` unless it says otherwise.
- Use role + accessible name (`find role button click --name "..."`); names are Spanish and exact.
- Screens with no URL change (Setup, Play, Reveal, Curtain, Scoreboard) are told apart by their buttons and copy, not the address bar.
- Reset by choosing `Volver` / `Inicio`, or reload `/` (game state is in memory and resets on reload).

## Proof and skip reporting

- Save artifacts under `.verify/artifacts/<feature-id>/` with `bash $V shot <feature-id>/<step>`.
- UI proof: `get text body` dump of the action state plus a screenshot of the result.
- Persisted proof (Diario): reload the page, then read the stored value or the rendered stats again.
- Report an unreachable path with the command tried and the missing precondition. Do not report it verified through another path.

## Features

- [Solo round](./solo-round.md): setup, random word clue, guessing with thermometer, hints, reveal, next round.
- [Duelo hotseat](./duelo.md): two names, own clue per player, curtain hand-off, scoreboard, rematch.
- [Diario](./diario.md): color of the day, one game per date, stats/streak calendar, share.
- [Home and chrome](./home-chrome.md): theme toggle, how-to-play sheet, legal pages, Profile sheet.
- [Clue APIs](./clue-apis.md): `/api/word-color` and `/api/color-word` contract, validation, rate limit.
