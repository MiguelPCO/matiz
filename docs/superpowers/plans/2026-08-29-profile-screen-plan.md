# Pantalla de Perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent profile button (Home, Setup, Play, Diario) that opens a Profile overlay showing the signed-in Google account and Diario stats (racha/calendario), reusing the existing `DailyStats` component.

**Architecture:** Profile is a controlled overlay (`fixed inset-0`, focus trap, Escape-to-close) following the exact pattern already established by `components/screens/HowToPlay.tsx` — never a phase in `GameState`/`DailyState`. Auth state is read via `useSupabaseAuth()` called independently per screen (matching the existing `useTheme()` per-screen-call precedent), except in Diario, which already gets `auth`/`signInWithGoogle`/`signOut` from `useDaily()`. Diario's local-history read is extracted from `hooks/useDaily.ts` into a new pure `lib/daily-storage.ts` module so Profile can read it without mounting the full `useDaily()` hook (which would duplicate its word-color fetch and remote-sync effects).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4, vitest (lib-only, `environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-08-29-profile-screen-design.md`

## Global Constraints

- Profile is an overlay controlled by local `useState` in each screen that mounts it — never added to `GameState.phase` or `DailyState.phase`.
- Scope is Diario stats only. Solo/Duelo stats are explicitly out of scope (no persistence exists for those modes).
- No new React Context — auth access follows the existing per-screen-hook-call pattern already used for `useTheme()`.
- Profile must never mount `useDaily()` — it reads local Diario history via the new `lib/daily-storage.ts`, never triggers a remote fetch or sync itself.
- `ProfileButton` shows the same glyph vocabulary Diario's old inline button used: `◐` signed-in, `○` signed-out.
- The profile entry point (button) is gated by `isSupabaseConfigured()` in every screen that shows it — same gate already used in `Diario.tsx` today.
- No component/hook tests — this codebase has zero `components/**/*.test.tsx` and zero `hooks/**/*.test.ts` files; verification for UI tasks is `pnpm typecheck && pnpm lint && pnpm build`, matching Sprint 2's established precedent. Only the new pure `lib/daily-storage.ts` gets unit tests (`environment: "node"`, no `window`/`localStorage` global — tests stub `window` manually via `vi.stubGlobal`).
- Commits: `git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit ...`, explicit file staging (never `-A`/`.`), no AI co-author trailer.

## File Structure

- **Create** `lib/daily-storage.ts` — pure localStorage I/O for Diario history (extracted from `hooks/useDaily.ts`).
- **Create** `lib/daily-storage.test.ts` — unit tests for the above.
- **Modify** `hooks/useDaily.ts` — imports the extracted functions instead of defining them locally; no behavior change.
- **Modify** `hooks/useSupabaseAuth.ts` — `AuthState` gains `email: string | null`.
- **Create** `components/ui/ProfileButton.tsx` — icon-button, `◐`/`○`, opens Profile.
- **Create** `components/screens/Profile.tsx` — the overlay itself (account section + `DailyStats`).
- **Modify** `components/screens/Home.tsx` — mounts `ProfileButton` + `Profile`.
- **Modify** `components/screens/Setup.tsx` — gains theme toggle (didn't have one) + `ProfileButton` + `Profile`.
- **Modify** `components/screens/Play.tsx` — gains theme toggle (didn't have one) + `ProfileButton` + `Profile` (covers Solo/Duelo gameplay and their Reveal screen — no change to `components/game/Reveal.tsx` itself).
- **Modify** `components/screens/Diario.tsx` — replaces its bespoke inline auth icon-button with `ProfileButton` + `Profile`, reusing `useDaily()`'s existing `auth`/`signInWithGoogle`/`signOut`.

---

### Task 1: Extract `lib/daily-storage.ts`

**Files:**
- Create: `lib/daily-storage.ts`
- Create: `lib/daily-storage.test.ts`
- Modify: `hooks/useDaily.ts:28-76` (remove `DAILY_HISTORY_STORAGE_KEY` const and the three functions, replace with an import)

**Interfaces:**
- Produces: `DAILY_HISTORY_STORAGE_KEY: string`, `readHistory(): DailyHistory`, `persistHistory(history: DailyHistory): DailyHistory`, `writeHistoryEntry(base: DailyHistory, dateKey: string, result: DailyResult): DailyHistory` — all from `lib/daily-storage.ts`. `DailyHistory`/`DailyResult` types come from `lib/daily.ts` (unchanged).

- [ ] **Step 1: Write the failing tests**

Create `lib/daily-storage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DAILY_HISTORY_STORAGE_KEY, persistHistory, readHistory, writeHistoryEntry } from "./daily-storage";
import type { DailyHistory } from "./daily";

function fakeWindow(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  };
}

describe("daily-storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readHistory sin window (SSR) devuelve {}", () => {
    expect(readHistory()).toEqual({});
  });

  it("readHistory sin dato guardado devuelve {}", () => {
    vi.stubGlobal("window", fakeWindow());
    expect(readHistory()).toEqual({});
  });

  it("readHistory devuelve lo que persistHistory guardó", () => {
    vi.stubGlobal("window", fakeWindow());
    const history: DailyHistory = {
      "2026-08-29": { guesses: [], hints: [], status: "solved", score: 100 },
    };
    persistHistory(history);
    expect(readHistory()).toEqual(history);
  });

  it("readHistory con JSON corrupto devuelve {} en vez de lanzar", () => {
    vi.stubGlobal("window", fakeWindow({ [DAILY_HISTORY_STORAGE_KEY]: "{not json" }));
    expect(readHistory()).toEqual({});
  });

  it("writeHistoryEntry agrega una entrada sin pisar las demás, y persiste", () => {
    vi.stubGlobal("window", fakeWindow());
    const base: DailyHistory = {
      "2026-08-28": { guesses: [], hints: [], status: "solved", score: 80 },
    };
    const result = writeHistoryEntry(base, "2026-08-29", {
      guesses: [],
      hints: [],
      status: "failed",
      score: 0,
    });
    expect(result).toEqual({
      "2026-08-28": { guesses: [], hints: [], status: "solved", score: 80 },
      "2026-08-29": { guesses: [], hints: [], status: "failed", score: 0 },
    });
    expect(readHistory()).toEqual(result);
  });

  it("persistHistory sin window (SSR) no lanza", () => {
    expect(() => persistHistory({})).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test daily-storage`
Expected: FAIL — `Cannot find module './daily-storage'` (file doesn't exist yet).

- [ ] **Step 3: Write `lib/daily-storage.ts`**

```ts
import type { DailyHistory, DailyResult } from "./daily";

/**
 * I/O puro de localStorage para el historial de Diario — extraído de
 * hooks/useDaily.ts (ver docs/superpowers/specs/2026-08-29-profile-screen-design.md)
 * para que la pantalla de Perfil pueda leer el historial sin montar el hook
 * completo (que dispara fetch de palabra-pista y sync remoto).
 */

export const DAILY_HISTORY_STORAGE_KEY = "matiz-daily-history-v1";

export function readHistory(): DailyHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAILY_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DailyHistory;
  } catch {
    return {};
  }
}

export function persistHistory(history: DailyHistory): DailyHistory {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
  return history;
}

export function writeHistoryEntry(base: DailyHistory, dateKey: string, result: DailyResult): DailyHistory {
  return persistHistory({ ...base, [dateKey]: result });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test daily-storage`
Expected: PASS, 6/6.

- [ ] **Step 5: Update `hooks/useDaily.ts` to import from the extracted module**

In `hooks/useDaily.ts`, replace lines 28-76 (the constant + `readLegacyCache`'s neighbors — keep `DAILY_STORAGE_KEY`, `DailyStorage`, and `readLegacyCache` exactly as they are; only `DAILY_HISTORY_STORAGE_KEY` and the three functions below `readLegacyCache` move out):

Remove this line near the top:
```ts
const DAILY_HISTORY_STORAGE_KEY = "matiz-daily-history-v1";
```

Remove these three functions (currently right after `readLegacyCache`):
```ts
function readHistory(): DailyHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAILY_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DailyHistory;
  } catch {
    return {};
  }
}

function persistHistory(history: DailyHistory): DailyHistory {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
  return history;
}

function writeHistoryEntry(base: DailyHistory, dateKey: string, result: DailyResult): DailyHistory {
  return persistHistory({ ...base, [dateKey]: result });
}
```

Add this import near the top of the file, alongside the other `../lib/*` imports:
```ts
import { persistHistory, readHistory, writeHistoryEntry } from "../lib/daily-storage";
```

The rest of `hooks/useDaily.ts` is unchanged — it calls `readHistory()`/`persistHistory()`/`writeHistoryEntry()` exactly as before, now imported instead of locally defined.

- [ ] **Step 6: Verify nothing broke**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: typecheck clean, full suite passes (85 + 6 new = 91), lint clean on `lib/daily-storage.ts` / `lib/daily-storage.test.ts` / `hooks/useDaily.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/daily-storage.ts lib/daily-storage.test.ts hooks/useDaily.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Extrae lib/daily-storage.ts de hooks/useDaily.ts (I/O puro del historial de Diario)"
```

---

### Task 2: `AuthState` gains `email`

**Files:**
- Modify: `hooks/useSupabaseAuth.ts`

**Interfaces:**
- Produces: `AuthState` now has `readonly email: string | null` alongside the existing `status`/`userId`.

- [ ] **Step 1: Update the `AuthState` interface and `SIGNED_OUT` constant**

In `hooks/useSupabaseAuth.ts`, replace:
```ts
export interface AuthState {
  readonly status: "loading" | "signed-out" | "signed-in";
  readonly userId: string | null;
}

const SIGNED_OUT: AuthState = { status: "signed-out", userId: null };
```
with:
```ts
export interface AuthState {
  readonly status: "loading" | "signed-out" | "signed-in";
  readonly userId: string | null;
  readonly email: string | null;
}

const SIGNED_OUT: AuthState = { status: "signed-out", userId: null, email: null };
```

- [ ] **Step 2: Update the initial `useState` call**

Replace:
```ts
  const [auth, setAuth] = useState<AuthState>(configured ? { status: "loading", userId: null } : SIGNED_OUT);
```
with:
```ts
  const [auth, setAuth] = useState<AuthState>(
    configured ? { status: "loading", userId: null, email: null } : SIGNED_OUT,
  );
```

- [ ] **Step 3: Populate `email` in `getSession` and `onAuthStateChange`**

Replace:
```ts
    supabase.auth.getSession().then(
      ({ data }) => {
        setAuth(
          data.session
            ? { status: "signed-in", userId: data.session.user.id }
            : SIGNED_OUT,
        );
      },
      () => setAuth(SIGNED_OUT),
    );

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session ? { status: "signed-in", userId: session.user.id } : SIGNED_OUT);
    });
```
with:
```ts
    supabase.auth.getSession().then(
      ({ data }) => {
        setAuth(
          data.session
            ? { status: "signed-in", userId: data.session.user.id, email: data.session.user.email ?? null }
            : SIGNED_OUT,
        );
      },
      () => setAuth(SIGNED_OUT),
    );

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(
        session
          ? { status: "signed-in", userId: session.user.id, email: session.user.email ?? null }
          : SIGNED_OUT,
      );
    });
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all clean — this file has no dedicated test (hooks aren't unit-tested in this project), so typecheck is the primary signal that every call site (`hooks/useDaily.ts`, `components/screens/Diario.tsx`) still compiles against the new shape.

- [ ] **Step 5: Commit**

```bash
git add hooks/useSupabaseAuth.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "useSupabaseAuth: AuthState gana email, para mostrarlo en Perfil"
```

---

### Task 3: `components/ui/ProfileButton.tsx`

**Files:**
- Create: `components/ui/ProfileButton.tsx`

**Interfaces:**
- Consumes: nothing beyond its own props.
- Produces: `ProfileButton({ signedIn: boolean, onClick: () => void })` — no default export, named export `ProfileButton`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

interface ProfileButtonProps {
  readonly signedIn: boolean;
  readonly onClick: () => void;
}

/**
 * Mismo glifo que usaba el botón de cuenta que vivía solo en Diario.tsx
 * (◐ con sesión, ○ sin ella) — ver
 * docs/superpowers/specs/2026-08-29-profile-screen-design.md. Sin lógica de
 * auth propia: quien lo monta decide si mostrarlo (gate isSupabaseConfigured())
 * y qué pasarle en signedIn/onClick.
 */
export function ProfileButton({ signedIn, onClick }: ProfileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Perfil"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
    >
      {signedIn ? "◐" : "○"}
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (component isn't wired into any screen yet, so `pnpm build` isn't meaningful until Task 5 — typecheck/lint alone confirm this file is well-formed).

- [ ] **Step 3: Commit**

```bash
git add components/ui/ProfileButton.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Añade components/ui/ProfileButton.tsx"
```

---

### Task 4: `components/screens/Profile.tsx`

**Files:**
- Create: `components/screens/Profile.tsx`

**Interfaces:**
- Consumes: `AuthState` from `hooks/useSupabaseAuth.ts` (Task 2's shape — has `email`), `readHistory` from `lib/daily-storage.ts` (Task 1), `localDateKey` from `lib/daily.ts` (existing, unchanged), `DailyStats` from `components/game/DailyStats.tsx` (existing, unchanged — takes `{history: DailyHistory, todayKey: string}`), `Button`/`Label` from `components/ui/`.
- Produces: `Profile({ open: boolean, onClose: () => void, auth: AuthState, signInWithGoogle: () => void, signOut: () => void })` — no default export, named export `Profile`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { localDateKey } from "../../lib/daily";
import { readHistory } from "../../lib/daily-storage";
import type { DailyHistory } from "../../lib/daily";
import type { AuthState } from "../../hooks/useSupabaseAuth";
import { DailyStats } from "../game/DailyStats";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";

interface ProfileProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly auth: AuthState;
  readonly signInWithGoogle: () => void;
  readonly signOut: () => void;
}

/**
 * Overlay controlado, no una fase del motor — mismo patrón que
 * HowToPlay.tsx (ver docs/superpowers/specs/2026-08-29-profile-screen-design.md).
 * Lee el historial de Diario directo de localStorage (lib/daily-storage.ts)
 * en vez de montar useDaily() completo — evita duplicar su fetch de
 * palabra-pista y su efecto de sync remoto. Estadísticas de Solo/Duelo:
 * fuera de alcance (esos modos no persisten nada todavía).
 */
export function Profile({ open, onClose, auth, signInWithGoogle, signOut }: ProfileProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<DailyHistory>({});

  useEffect(() => {
    if (open) setHistory(readHistory());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Perfil"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-0/95 px-4 pt-10 pb-6"
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between">
          <Label>Perfil</Label>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="font-mono text-lg text-text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-surface-1 p-4">
          {auth.status === "signed-in" ? (
            <>
              <p className="font-sans text-sm text-text">{auth.email ?? "Sesión iniciada"}</p>
              <Button variant="secondary" onClick={signOut}>
                Cerrar sesión
              </Button>
            </>
          ) : (
            <>
              <p className="font-sans text-sm text-text-muted">
                Inicia sesión para guardar tus estadísticas de Diario en la nube.
              </p>
              <Button variant="secondary" onClick={signInWithGoogle} disabled={auth.status === "loading"}>
                Iniciar sesión con Google
              </Button>
            </>
          )}
        </div>

        <DailyStats history={history} todayKey={localDateKey(new Date())} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/screens/Profile.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Añade components/screens/Profile.tsx"
```

---

### Task 5: Wire into `Home.tsx`

**Files:**
- Modify: `components/screens/Home.tsx`

**Interfaces:**
- Consumes: `ProfileButton` (Task 3), `Profile` (Task 4), `useSupabaseAuth` (Task 2's shape), `isSupabaseConfigured` from `../../lib/supabase` (existing).

- [ ] **Step 1: Add imports**

In `components/screens/Home.tsx`, after the existing `import { useTheme } from "../../hooks/useTheme";` line, add:
```ts
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { isSupabaseConfigured } from "../../lib/supabase";
```
After `import { Label } from "../ui/Label";`, add:
```ts
import { ProfileButton } from "../ui/ProfileButton";
import { Profile } from "./Profile";
```

- [ ] **Step 2: Add state**

Inside `export function Home()`, after `const [theme, toggleTheme] = useTheme();`, add:
```ts
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const [profileOpen, setProfileOpen] = useState(false);
```

- [ ] **Step 3: Insert `ProfileButton` next to the theme toggle**

Replace:
```tsx
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          type="button"
          onClick={() => setHowToPlayOpen(true)}
          aria-label="Cómo se juega"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
        >
          ?
        </button>
      </div>
```
with:
```tsx
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        {isSupabaseConfigured() && (
          <ProfileButton signedIn={auth.status === "signed-in"} onClick={() => setProfileOpen(true)} />
        )}
        <button
          type="button"
          onClick={() => setHowToPlayOpen(true)}
          aria-label="Cómo se juega"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
        >
          ?
        </button>
      </div>
```

- [ ] **Step 4: Render `Profile` alongside `HowToPlay`**

Replace:
```tsx
      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
    </main>
  );
}
```
with:
```tsx
      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        auth={auth}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
      />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/screens/Home.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Home.tsx: monta ProfileButton + Profile junto al toggle de tema"
```

---

### Task 6: Wire into `Setup.tsx`

**Files:**
- Modify: `components/screens/Setup.tsx`

**Interfaces:**
- Consumes: `useTheme` (existing, not currently imported here), `useSupabaseAuth`, `isSupabaseConfigured`, `ProfileButton`, `Profile` — same as Task 5.

- [ ] **Step 1: Add imports**

In `components/screens/Setup.tsx`, after `import { useCallback, useEffect, useRef, useState } from "react";`, add:
```ts
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useTheme } from "../../hooks/useTheme";
```
After `import { extractColor } from "../../lib/extract";`, add:
```ts
import { isSupabaseConfigured } from "../../lib/supabase";
```
After `import { Segmented } from "../ui/Segmented";`, add:
```ts
import { ProfileButton } from "../ui/ProfileButton";
```
After `import { HowToPlay } from "./HowToPlay";`, add:
```ts
import { Profile } from "./Profile";
```

- [ ] **Step 2: Add state**

Inside `export function Setup()`, after `const [howToPlayOpen, setHowToPlayOpen] = useState(false);`, add:
```ts
  const [theme, toggleTheme] = useTheme();
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const [profileOpen, setProfileOpen] = useState(false);
```

- [ ] **Step 3: Group the right-side header icons and insert the theme toggle + `ProfileButton`**

Replace:
```tsx
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: "GO_HOME" })}
          aria-label="Volver"
          className="font-mono text-lg text-text-muted"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => setHowToPlayOpen(true)}
          aria-label="Cómo se juega"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
        >
          ?
        </button>
      </div>
```
with:
```tsx
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: "GO_HOME" })}
          aria-label="Volver"
          className="font-mono text-lg text-text-muted"
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {isSupabaseConfigured() && (
            <ProfileButton signedIn={auth.status === "signed-in"} onClick={() => setProfileOpen(true)} />
          )}
          <button
            type="button"
            onClick={() => setHowToPlayOpen(true)}
            aria-label="Cómo se juega"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            ?
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Render `Profile` alongside `HowToPlay`**

Replace:
```tsx
      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
    </main>
  );
}
```
with:
```tsx
      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        auth={auth}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
      />
    </main>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/screens/Setup.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Setup.tsx: agrega toggle de tema + ProfileButton + Profile"
```

---

### Task 7: Wire into `Play.tsx`

**Files:**
- Modify: `components/screens/Play.tsx`

**Interfaces:**
- Consumes: same as Task 5/6.

- [ ] **Step 1: Add imports**

In `components/screens/Play.tsx`, after `import { useGame } from "../../hooks/useGame";`, add:
```ts
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useTheme } from "../../hooks/useTheme";
```
After `import { colorWord } from "../../lib/color-word";`, add:
```ts
import { isSupabaseConfigured } from "../../lib/supabase";
```
After `import { HintRow } from "../game/HintRow";`, add:
```ts
import { ProfileButton } from "../ui/ProfileButton";
```
After `import { Reveal } from "../game/Reveal";`, add:
```ts
import { Profile } from "./Profile";
```

- [ ] **Step 2: Add state**

Inside `export function Play()`, after `const [confirmingExit, setConfirmingExit] = useState(false);`, add:
```ts
  const [theme, toggleTheme] = useTheme();
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const [profileOpen, setProfileOpen] = useState(false);
```

- [ ] **Step 3: Add a right-side icon group to the existing header row**

Replace:
```tsx
      <div className="flex w-full max-w-xs items-center justify-between">
        {!confirmingExit ? (
          <button
            type="button"
            onClick={() => setConfirmingExit(true)}
            aria-label="Volver"
            className="font-mono text-lg text-text-muted"
          >
            ←
          </button>
        ) : (
          <div className="flex items-center gap-2 font-sans text-xs">
            <span className="text-text-muted">¿Salir? Perderás la ronda.</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "GO_HOME" })}
              className="text-signal"
            >
              Salir
            </button>
            <button
              type="button"
              onClick={() => setConfirmingExit(false)}
              className="text-text-muted"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
```
with:
```tsx
      <div className="flex w-full max-w-xs items-center justify-between">
        {!confirmingExit ? (
          <button
            type="button"
            onClick={() => setConfirmingExit(true)}
            aria-label="Volver"
            className="font-mono text-lg text-text-muted"
          >
            ←
          </button>
        ) : (
          <div className="flex items-center gap-2 font-sans text-xs">
            <span className="text-text-muted">¿Salir? Perderás la ronda.</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "GO_HOME" })}
              className="text-signal"
            >
              Salir
            </button>
            <button
              type="button"
              onClick={() => setConfirmingExit(false)}
              className="text-text-muted"
            >
              Cancelar
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {isSupabaseConfigured() && (
            <ProfileButton signedIn={auth.status === "signed-in"} onClick={() => setProfileOpen(true)} />
          )}
        </div>
      </div>
```

- [ ] **Step 4: Render `Profile` before the closing `</div>`**

Replace the end of the component:
```tsx
      ) : (
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel={
            state.mode === "solo" ? "Otra ronda" : state.rounds.length >= 2 ? "Ver marcador" : "Continuar"
          }
          onAction={() => dispatch({ type: "NEXT" })}
        />
      )}
    </div>
  );
}
```
with:
```tsx
      ) : (
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel={
            state.mode === "solo" ? "Otra ronda" : state.rounds.length >= 2 ? "Ver marcador" : "Continuar"
          }
          onAction={() => dispatch({ type: "NEXT" })}
        />
      )}
      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        auth={auth}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/screens/Play.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Play.tsx: agrega toggle de tema + ProfileButton + Profile (cubre Solo y Duelo)"
```

---

### Task 8: Wire into `Diario.tsx` (retire its bespoke auth button)

**Files:**
- Modify: `components/screens/Diario.tsx`

**Interfaces:**
- Consumes: `ProfileButton` (Task 3), `Profile` (Task 4). Does NOT call `useSupabaseAuth()` — reuses `auth`/`signInWithGoogle`/`signOut` already returned by `useDaily()` at line 45.

- [ ] **Step 1: Add imports**

In `components/screens/Diario.tsx`, after `import { HintRow } from "../game/HintRow";`, add:
```ts
import { ProfileButton } from "../ui/ProfileButton";
```
After `import { Thermometer } from "../game/Thermometer";`, add:
```ts
import { Profile } from "./Profile";
```

- [ ] **Step 2: Add state**

Inside `export function Diario()`, after `const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");`, add:
```ts
  const [profileOpen, setProfileOpen] = useState(false);
```

- [ ] **Step 3: Replace the bespoke inline auth button with `ProfileButton`**

Replace:
```tsx
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() && (
            // auth.status === "loading" (getSession aún resolviendo, p. ej.
            // justo al volver del callback de Google) deja el botón
            // deshabilitado y sin handler: pulsarlo ahí dispararía un SEGUNDO
            // redirect de OAuth encima del que acaba de completar.
            <button
              type="button"
              onClick={
                auth.status === "loading"
                  ? undefined
                  : auth.status === "signed-in"
                    ? signOut
                    : signInWithGoogle
              }
              disabled={auth.status === "loading"}
              aria-label={
                auth.status === "loading"
                  ? "Cargando sesión"
                  : auth.status === "signed-in"
                    ? "Cerrar sesión"
                    : "Iniciar sesión con Google"
              }
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted disabled:opacity-40"
            >
              {auth.status === "signed-in" ? "◐" : "○"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
```
with:
```tsx
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() && (
            <ProfileButton signedIn={auth.status === "signed-in"} onClick={() => setProfileOpen(true)} />
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
```

- [ ] **Step 4: Render `Profile` before the closing `</div>`**

Replace:
```tsx
          <Link href="/" className="font-sans text-sm text-text-muted underline">
            Volver a inicio
          </Link>
        </>
      )}
    </div>
  );
}
```
with:
```tsx
          <Link href="/" className="font-sans text-sm text-text-muted underline">
            Volver a inicio
          </Link>
        </>
      )}
      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        auth={auth}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean, build succeeds. This is the last task — also run `pnpm test` once more to confirm the full suite (91 tests) is still green end to end.

- [ ] **Step 6: Commit**

```bash
git add components/screens/Diario.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Diario.tsx: reemplaza el botón de cuenta inline por ProfileButton + Profile"
```

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — overlay pattern (Task 4), `ProfileButton` reuse of ◐/○ glyph (Task 3), `AuthState.email` (Task 2), `lib/daily-storage.ts` extraction (Task 1), the four screen wirings including Setup/Play gaining the theme toggle they lacked (Tasks 5-8), Diario's bespoke button retirement (Task 8). Out-of-scope items (Solo/Duelo stats, avatar/name editing, account/history deletion) are not touched by any task, matching the spec's explicit exclusions.
- **Type consistency:** `AuthState` (Task 2) is consumed identically in Tasks 5-8 (`auth.status === "signed-in"`, `auth.email`). `Profile`'s prop names (`open`, `onClose`, `auth`, `signInWithGoogle`, `signOut`) match exactly across all four call sites. `ProfileButton`'s `signedIn`/`onClick` match every call site. `readHistory`/`persistHistory`/`writeHistoryEntry` signatures in Task 1 match their pre-extraction shape exactly (no behavior change), confirmed by the full existing suite staying green.
- **Task ordering:** Task 1 and 2 are independent of each other but both must land before Task 4 (`Profile.tsx` imports from both). Tasks 3-4 must land before 5-8. Tasks 5-8 are independent of each other (each touches a different file) and could in principle run in parallel, but are listed sequentially since Task 8 reasons about a diff (removing Diario's old button) that's easiest to verify last, after the pattern is proven three times over.
