# Home and chrome

The Home screen and the controls repeated on every screen: theme toggle, how-to-play sheet, Profile sheet, and footer links to the legal pages.

## Sub-features

- `chrome-theme` `Activar tema oscuro` / `Activar tema claro` toggles the theme; the label flips.
- `chrome-howto` `Cómo se juega` (on Home, Setup, Play, Diario) opens a dialog with the rules and the colorblind statement; focus is trapped, Escape/`Cerrar` close it and return focus to the trigger, the round is untouched.
- `chrome-profile` `Perfil, sin sesión` opens a dialog named `Perfil` with `Iniciar sesión con Google` (only when Supabase env is set).
- `chrome-legal` footer links `PRIVACIDAD` → `/privacidad`, `AVISO LEGAL` → `/aviso-legal`.

## How to get to it (user POV)

- Top-right icon buttons on Home, Setup, Play and Diario.
- Footer links on Home.

## Driving it with agent-browser

Preconditions:

- Baseline from the index.

- **Theme.** Run `bash $V ab find role button click --name "Activar tema oscuro"`. The button is now named `Activar tema claro`, and `bash $V ab eval "document.documentElement.dataset.theme"` changes. Proof: `bash $V shot home-chrome/dark`.
- **How to play.** Run `bash $V ab find role button click --name "Cómo se juega"`. A dialog `Cómo se juega` is in the snapshot. Close with `bash $V ab find role button click --name "Cerrar"`; the dialog is gone.
- **How to play mid-round (Play, Diario).** Start a Solo round (see [Solo round](./solo-round.md)), guess once, save `get text body` to `.verify/artifacts/home-chrome/before.txt`. Open `Cómo se juega`; text contains `Sobre el daltonismo`. Click the dialog text (`bash $V ab find text "Lee los ejes." click`), press Tab 8 times: `bash $V ab eval "document.activeElement.getAttribute('aria-label')"` stays `Cerrar`. Press Escape: focus returns to `Cómo se juega`, and `get text body` equals `before.txt` (no guess or hint was spent). Repeat open/close on `/diario`.
- **Profile.** Run `bash $V ab find role button click --name "Perfil, sin sesión"`. A dialog `Perfil` shows `Iniciar sesión con Google`. Close with `Cerrar`. Do not click the sign-in button.
- **Legal.** Run `bash $V ab find role link click --name "PRIVACIDAD"`. URL is `/privacidad` and the page has a heading. Repeat for `AVISO LEGAL` → `/aviso-legal`.

## Gotchas

- Theme is stored per browser; a toggle persists across reloads in the `matiz-verify` session. Toggle back before other recipes if screenshots must match.
- The Profile button is absent when `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset; that is expected, not a failure.
- Google sign-in leaves localhost for accounts.google.com; agents must not enter credentials.
- Link names render uppercase via CSS but the accessible name may be `Privacidad`; use whatever `snapshot -i` reports.
