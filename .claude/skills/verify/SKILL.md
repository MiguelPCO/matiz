---
name: verify
description: Drive the MATIZ web app (Next.js color-perception game) in a real browser the way a player does, and capture proof. Use after any change to screens, game engine, Diario, clue APIs or auth, before claiming it works, or when asked to run/verify/screenshot MATIZ.
---

# Verify MATIZ

MATIZ is a single-page Next.js 15 web game. The surface is the browser UI at `http://localhost:4000`: `/` (Solo + Duelo, phase lives in React state, not the URL), `/diario`, `/privacidad`, `/aviso-legal`. Two server routes call Claude: `POST /api/word-color` (word → hex) and `POST /api/color-word` (hex → word). Optional Supabase auth (Google) only on the Profile sheet.

All commands below run from the repo root. The helper is `.claude/skills/verify/matiz-verify.sh` (alias it `V`):

```bash
V=".claude/skills/verify/matiz-verify.sh"
```

## Launch

```bash
bash $V up        # prints "ready http://localhost:4000 pid <n>"
```

Starts `next dev --turbopack -p 4000` with the repo's `.env.local` (Anthropic key + Supabase). Ready = Next printed `Ready in` AND `GET /` returns 200. No DB migrations or seeds: game state is in memory, Diario history in browser `localStorage`. First page compile takes a few seconds; the first `ab open` may be slow.

Port 4000 is the project convention. `up` refuses if anything already listens on it (probably the user's own dev server): do not drive it, ask the user or use `PORT=4010 bash $V up` (then pass the same `PORT` to every later command). Two instances in the same checkout share `.next/` and can corrupt each other's build cache; run one per checkout.

## Doctor

```bash
bash $V doctor    # exit 0 = worth driving
```

Checks: port owned by the PID `up` recorded; `/` renders `MATIZ`; `/api/word-color` rejects an empty body with `{"error":"invalid"}` (route alive, no paid Claude call); `.env.local` was loaded. Run it first whenever something looks off.

## Drive

Harness: `agent-browser` (installed globally) in the isolated session `matiz-verify`, so it never touches the user's Chrome profile. `bash $V ab <args>` = `agent-browser --session matiz-verify <args>`.

```bash
bash $V ab open http://localhost:4000
bash $V ab set viewport 390 844                     # ALWAYS: phone size, see below
bash $V ab snapshot -i                               # interactive a11y tree with refs
bash $V ab find role button click --name "Solo"
bash $V ab find role radio click --name "5×5"
bash $V ab find role button click --name "Fila 2, columna 3"
bash $V ab get text body                             # visible copy: clue, thermometer, verdict, score
bash $V ab errors                                    # page errors (should be empty)
```

Stable handles (all Spanish, exact): buttons `Solo`, `Duelo`, `Empezar`, `Volver`, `Cómo se juega`, `Activar tema oscuro`/`Activar tema claro`, `Perfil, sin sesión`, `Otra ronda`, `Continuar`, `Ver marcador`, `Revancha`, `Inicio`; radios `4×4` `5×5` `6×6` `8×8`, `Fácil` `Medio` `Difícil`, `Palabra` `Imagen`; textboxes `Jugador 1`, `Jugador 2`; grid cells `Fila R, columna C` (1-based) also carry `data-row`/`data-col` (0-based); the revealed target cell gets `data-target` only after the round ends. Prefer role + name; refs (`@e4`) change on every snapshot.

Set the phone viewport right after the first `open`. The default window is ~570 px tall; controls below the fold (hint row, Reveal action) get clicked off-screen, `click` still prints `Done`, and nothing happens. MATIZ is mobile-first, so 390×844 is also the layout that matters.

Wait on state, not time: `bash $V ab wait --text "Otra ronda"` or `bash $V ab wait "[data-row]"`. Clue generation calls Claude (1-3 s).

## Evidence

```bash
bash $V shot solo-round/reveal      # -> .verify/artifacts/solo-round/reveal.png
bash $V ab snapshot -i > .verify/artifacts/solo-round/reveal.aria.txt
bash $V ab get text body > .verify/artifacts/solo-round/reveal.txt
```

`.verify/` is git-ignored. Always pass `shot` a name, never a raw relative path to `agent-browser screenshot` (a path starting with `.` is parsed as a CSS selector and the file lands in a temp dir).

Proof standard:
- Drive the real user path (click `Solo`, tap cells). Never dispatch reducer actions, read `data-target` before the reveal, or call engine functions to "win".
- Capture the action and the result: a text dump or aria snapshot before the guess plus the reveal screenshot.
- Verify side effects, not just screens: Diario writes `localStorage` (`bash $V ab eval "localStorage.getItem('matiz-daily-history-v1')"`), clue routes return JSON you can `curl`.
- Real Claude calls are the production path; do not mock `/api/*`. Each costs a Haiku call and the routes allow 20 requests/min per IP, so don't loop them.

## Cleanup

```bash
bash $V down      # closes the matiz-verify browser session, kills only the PID tree `up` recorded
```

Removes `.verify/run/` (log, pid). Keeps `.verify/artifacts/`. Never kill `node.exe` by name: the user may run other dev servers. Run `down` after every failed attempt too.

## Feature map

Recipes per feature live in [`features/`](features/README.md). Drive every entry point a feature lists; one convenient path is not proof of the others. Keep the map current with `/maintain-verification-skill`.
