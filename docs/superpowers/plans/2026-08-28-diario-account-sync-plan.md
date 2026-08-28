# Diario: cuentas Google + Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Diario stats (racha/mejor racha/%/calendario) sync across devices for a signed-in user, via Google OAuth through Supabase Auth + a Supabase Postgres table — while local play with zero configuration keeps working exactly as it does today.

**Architecture:** Two new pure modules (`lib/supabase.ts` client factories, `lib/daily-sync.ts` merge logic), one new hook (`hooks/useSupabaseAuth.ts`), one new route handler (`app/auth/callback/route.ts`) for the OAuth code exchange, and an integration into the existing `hooks/useDaily.ts`/`components/screens/Diario.tsx`. `localStorage` stays the fast/offline source of truth; Supabase is a background sync layer that never blocks gameplay.

**Tech Stack:** Next.js 15.5.23 App Router, React 19.1.0, TypeScript strict, `@supabase/supabase-js` + `@supabase/ssr` (new), vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-28-diario-account-sync-design.md`

## Global Constraints

- Login: **Google OAuth only**, via **Supabase Auth** (no separate Auth.js) — spec §"Decisiones confirmadas".
- DB: Supabase Postgres, single table `daily_results`, RLS on, **insert + select only** (no update/delete policy) — spec §"Esquema de base de datos".
- Login is **optional, never required** to play Diario — `localStorage` must work with zero Supabase env vars configured, with no crash and no visible broken UI (this plan's own decision, tighter than the spec: the account button renders only when `isSupabaseConfigured()` is true, so an unconfigured build shows nothing extra at all).
- `localStorage` remains the source of truth gameplay reads from; Supabase sync never blocks or gates play — spec §"Decisiones confirmadas" #5.
- Remote fetch/merge happens only on Diario mount and on the `signed-out → signed-in` transition — **no realtime/websockets** — spec §"Fuera de alcance".
- Out of scope (do not build): Solo/Duelo stats sync, account deletion/export/GDPR tooling, non-Google providers, real infra provisioning (Miguel does this manually per the checklist at the bottom of the spec).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public by Supabase design (protected by RLS, not secrecy).
- All Supabase network calls are best-effort and never throw into the UI — same discipline as `lib/color-word.ts`/`lib/random-word.ts`.
- No middleware, no SSR-gated pages: Diario is entirely `"use client"` and never needs the session server-side outside the OAuth callback itself — deliberately simpler than the general `@supabase/ssr` protected-routes pattern, since nothing in this app is server-rendered behind auth.
- Commits: author only as `Miguel <xtremzmiguel@gmail.com>` (`git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit ...`), never an AI co-author trailer. Stage explicit filenames, never `-A`/`.` (there's a persistent untracked stray file `docs/superpowers/plans/2026-08-25-grid-target-reposition-plan.md` — leave it alone). Never push without a fresh, separate explicit "push" instruction.
- Run `pnpm typecheck && pnpm lint && pnpm test -- --run` after every task.

---

## File Structure

- `lib/daily-sync.ts` (new) — pure merge/diff functions over `DailyHistory`, no Supabase import, fully unit-testable.
- `lib/daily-sync.test.ts` (new)
- `lib/supabase.ts` (new) — `isSupabaseConfigured()`, `createBrowserSupabaseClient()`, `createServerSupabaseClient()`.
- `app/auth/callback/route.ts` (new) — OAuth code → session exchange, redirects to `/diario`.
- `hooks/useSupabaseAuth.ts` (new) — auth state + `signInWithGoogle`/`signOut`, no-ops when unconfigured.
- `hooks/useDaily.ts` (modify) — wires `useSupabaseAuth`, adds the sign-in merge/migration effect, adds best-effort remote insert to the existing completion effect, returns `auth`/`signInWithGoogle`/`signOut`.
- `components/screens/Diario.tsx` (modify) — account button next to the theme toggle, rendered only when `isSupabaseConfigured()`.
- `supabase/schema.sql` (new) — the SQL from the spec, verbatim, so it's versioned instead of living only in the spec doc; Miguel pastes this into the Supabase SQL editor per the checklist.
- `.env.local.example` (modify) — add the two new env var names (empty).
- `package.json` (modify) — add `@supabase/supabase-js`, `@supabase/ssr`.

---

### Task 1: Install packages, scaffold env vars

**Files:**
- Modify: `package.json`
- Modify: `.env.local.example`
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: the two npm packages available for import in every later task; `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` documented as the expected env var names.

- [ ] **Step 1: Install the packages**

Run: `pnpm add @supabase/supabase-js @supabase/ssr`

- [ ] **Step 2: Add the env vars to the example file**

Edit `.env.local.example` (currently just `ANTHROPIC_API_KEY=`) to:

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Create the versioned schema file**

Create `supabase/schema.sql`:

```sql
create table public.daily_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null, -- "YYYY-MM-DD", mismo formato que localDateKey()
  status text not null check (status in ('solved', 'failed')),
  score integer not null,
  guesses jsonb not null,
  hints jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

alter table public.daily_results enable row level security;

create policy "usuarios leen solo sus propias filas"
  on public.daily_results for select
  using (auth.uid() = user_id);

create policy "usuarios insertan solo sus propias filas"
  on public.daily_results for insert
  with check (auth.uid() = user_id);

-- sin policy de update/delete: un DailyResult de un día ya jugado no se
-- edita nunca (mismo invariante que localStorage — writeHistoryEntry solo
-- añade, GUESS/REQUEST_HINT no pueden tocar una ronda ya "solved"/"failed").
```

- [ ] **Step 4: Verify install**

Run: `pnpm typecheck`
Expected: PASS (no source changes yet, just confirms the install didn't break anything).

- [ ] **Step 5: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add package.json pnpm-lock.yaml .env.local.example supabase/schema.sql
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Instala @supabase/supabase-js y @supabase/ssr, añade schema SQL versionado"
```

---

### Task 2: `lib/daily-sync.ts` — pure merge logic

**Files:**
- Create: `lib/daily-sync.ts`
- Test: `lib/daily-sync.test.ts`

**Interfaces:**
- Consumes: `DailyHistory`, `DailyResult` from `lib/daily.ts` (already defined — `DailyHistory = Readonly<Record<string, DailyResult>>`, `DailyResult = { guesses, hints, status: "solved"|"failed", score }`).
- Produces: `mergeDailyHistory(local: DailyHistory, remote: DailyHistory): DailyHistory` and `entriesToUpload(local: DailyHistory, remote: DailyHistory): DailyHistory` — both used by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `lib/daily-sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { entriesToUpload, mergeDailyHistory } from "./daily-sync";
import type { DailyHistory, DailyResult } from "./daily";

function win(score = 100): DailyResult {
  return { guesses: [], hints: [], status: "solved", score };
}

function loss(score = 0): DailyResult {
  return { guesses: [], hints: [], status: "failed", score };
}

describe("daily-sync.mergeDailyHistory", () => {
  it("fechas que solo existen en local se incluyen tal cual", () => {
    const local: DailyHistory = { "2026-08-20": win() };
    const remote: DailyHistory = {};
    expect(mergeDailyHistory(local, remote)).toEqual({ "2026-08-20": win() });
  });

  it("fechas que solo existen en remote se incluyen tal cual", () => {
    const local: DailyHistory = {};
    const remote: DailyHistory = { "2026-08-20": win() };
    expect(mergeDailyHistory(local, remote)).toEqual({ "2026-08-20": win() });
  });

  it("misma fecha en ambos: remote gana", () => {
    const local: DailyHistory = { "2026-08-20": win(50) };
    const remote: DailyHistory = { "2026-08-20": win(999) };
    expect(mergeDailyHistory(local, remote)).toEqual({ "2026-08-20": win(999) });
  });

  it("historiales disjuntos se combinan completos", () => {
    const local: DailyHistory = { "2026-08-20": win() };
    const remote: DailyHistory = { "2026-08-21": loss() };
    expect(mergeDailyHistory(local, remote)).toEqual({
      "2026-08-20": win(),
      "2026-08-21": loss(),
    });
  });
});

describe("daily-sync.entriesToUpload", () => {
  it("fechas en local ausentes en remote se marcan para subir", () => {
    const local: DailyHistory = { "2026-08-20": win(), "2026-08-21": loss() };
    const remote: DailyHistory = { "2026-08-20": win() };
    expect(entriesToUpload(local, remote)).toEqual({ "2026-08-21": loss() });
  });

  it("todo ya sincronizado: nada que subir", () => {
    const local: DailyHistory = { "2026-08-20": win() };
    const remote: DailyHistory = { "2026-08-20": win() };
    expect(entriesToUpload(local, remote)).toEqual({});
  });

  it("local vacío: nada que subir", () => {
    expect(entriesToUpload({}, { "2026-08-20": win() })).toEqual({});
  });

  it("remote vacío: todo el local se sube", () => {
    const local: DailyHistory = { "2026-08-20": win(), "2026-08-21": loss() };
    expect(entriesToUpload(local, {})).toEqual(local);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --run daily-sync`
Expected: FAIL with "Cannot find module './daily-sync'" (file doesn't exist yet).

- [ ] **Step 3: Implement**

Create `lib/daily-sync.ts`:

```ts
import type { DailyHistory } from "./daily";

/**
 * Lógica pura de fusión entre historial local (localStorage) y remoto
 * (Supabase) — ver docs/superpowers/specs/2026-08-28-diario-account-sync-design.md.
 * Sin cliente Supabase aquí: hooks/useDaily.ts hace el fetch/insert y le
 * pasa los dos DailyHistory ya resueltos.
 */

/**
 * Fusiona historial local + remoto: el remoto gana si ambos tienen la misma
 * fecha (ya sincronizado desde otro dispositivo, la fila remota es la
 * autoritativa); las fechas que solo existen en uno de los dos se incluyen
 * tal cual.
 */
export function mergeDailyHistory(local: DailyHistory, remote: DailyHistory): DailyHistory {
  return { ...local, ...remote };
}

/**
 * De un historial local + uno remoto, qué entradas locales hay que subir
 * (existen en local pero no en remote) — usado para la migración al iniciar
 * sesión por primera vez y como reconciliación general en cada mount con
 * sesión activa.
 */
export function entriesToUpload(local: DailyHistory, remote: DailyHistory): DailyHistory {
  const result: Record<string, DailyHistory[string]> = {};
  for (const [dateKey, entry] of Object.entries(local)) {
    if (!(dateKey in remote)) result[dateKey] = entry;
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --run daily-sync`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add lib/daily-sync.ts lib/daily-sync.test.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Añade lib/daily-sync.ts: fusión pura de historial local/remoto de Diario"
```

---

### Task 3: `lib/supabase.ts` — client factories

**Files:**
- Create: `lib/supabase.ts`

**Interfaces:**
- Consumes: `@supabase/ssr`'s `createBrowserClient`/`createServerClient`; `next/headers`'s `cookies()` (async in Next 15).
- Produces: `isSupabaseConfigured(): boolean`, `createBrowserSupabaseClient(): SupabaseClient`, `createServerSupabaseClient(): Promise<SupabaseClient>` — consumed by Task 4 (server), Task 5 (browser, inside the hook), Task 6 (browser, inside `useDaily.ts` for the select/insert calls).

No test file: this is thin glue over a third-party SDK with no local branching logic beyond the configured-check, which several other call sites exercise indirectly (Tasks 5/6). Matches the project's existing pattern of not unit-testing `lib/word-color.ts`-style API wrappers' network path, only their pure helpers.

- [ ] **Step 1: Implement**

Create `lib/supabase.ts`:

```ts
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase — dos factories siguiendo @supabase/ssr (ver
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md). El login
 * es opcional: si Miguel no ha creado el proyecto Supabase todavía,
 * isSupabaseConfigured() es false y NINGÚN llamador debe crear un cliente —
 * createBrowserSupabaseClient()/createServerSupabaseClient() lanzan si se
 * llaman sin las env vars. hooks/useSupabaseAuth.ts y
 * components/screens/Diario.tsx comprueban isSupabaseConfigured() antes de
 * tocar cualquiera de las dos factories, así que ese lanzamiento nunca
 * ocurre en la práctica — es un guardrail, no el mecanismo principal.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} — ver checklist manual en el spec de account-sync.`);
  }
  return value;
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Solo el route handler de callback (Task 4) llama a esto, y ahí
          // SÍ se pueden escribir cookies — este catch es defensivo por si
          // createServerSupabaseClient se reutiliza algún día desde un
          // Server Component puro, donde cookies() es de solo lectura.
        }
      },
    },
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add lib/supabase.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Añade lib/supabase.ts: factories de cliente Supabase browser/server"
```

---

### Task 4: `app/auth/callback/route.ts` — OAuth callback

**Files:**
- Create: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` from Task 3.
- Produces: the `redirectTo` target that Task 5's `signInWithGoogle` points at (`${origin}/auth/callback`).

- [ ] **Step 1: Implement**

Create `app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase";

/**
 * Callback OAuth de Supabase Auth (Google) — intercambia el `code` de la
 * URL por una sesión y la deja en cookies (vía createServerSupabaseClient),
 * luego redirige a Diario. Sin este route handler el login con Google
 * nunca completa (ver checklist manual en
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/diario`);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add app/auth/callback/route.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Añade app/auth/callback/route.ts: intercambio de code OAuth por sesión"
```

---

### Task 5: `hooks/useSupabaseAuth.ts`

**Files:**
- Create: `hooks/useSupabaseAuth.ts`

**Interfaces:**
- Consumes: `isSupabaseConfigured()`, `createBrowserSupabaseClient()` from Task 3.
- Produces:
  ```ts
  export interface AuthState {
    readonly status: "loading" | "signed-out" | "signed-in";
    readonly userId: string | null;
  }
  export function useSupabaseAuth(): {
    readonly auth: AuthState;
    readonly signInWithGoogle: () => void;
    readonly signOut: () => void;
  }
  ```
  Consumed by Task 6 (`hooks/useDaily.ts`) and, through it, Task 7 (`Diario.tsx`).

- [ ] **Step 1: Implement**

Create `hooks/useSupabaseAuth.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "../lib/supabase";

/**
 * Estado de sesión Supabase Auth (Google OAuth) — ver
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md. Login
 * opcional: si isSupabaseConfigured() es false (Miguel no ha creado el
 * proyecto Supabase todavía), este hook nunca toca el SDK — se queda en
 * "signed-out" para siempre y signInWithGoogle/signOut son no-ops. Eso deja
 * jugar Diario en local exactamente igual que hoy, sin runtime error por
 * env vars ausentes.
 */

export interface AuthState {
  readonly status: "loading" | "signed-out" | "signed-in";
  readonly userId: string | null;
}

const SIGNED_OUT: AuthState = { status: "signed-out", userId: null };

export function useSupabaseAuth(): {
  readonly auth: AuthState;
  readonly signInWithGoogle: () => void;
  readonly signOut: () => void;
} {
  const configured = isSupabaseConfigured();
  const [auth, setAuth] = useState<AuthState>(configured ? { status: "loading", userId: null } : SIGNED_OUT);
  const supabase = useMemo(() => (configured ? createBrowserSupabaseClient() : null), [configured]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setAuth(
        data.session
          ? { status: "signed-in", userId: data.session.user.id }
          : SIGNED_OUT,
      );
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session ? { status: "signed-in", userId: session.user.id } : SIGNED_OUT);
    });

    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  const signInWithGoogle = useCallback(() => {
    if (!supabase) return;
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, [supabase]);

  const signOut = useCallback(() => {
    if (!supabase) return;
    supabase.auth.signOut();
  }, [supabase]);

  return { auth, signInWithGoogle, signOut };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add hooks/useSupabaseAuth.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Añade hooks/useSupabaseAuth.ts: estado de sesión Google/Supabase, no-op sin configurar"
```

---

### Task 6: Wire sync into `hooks/useDaily.ts`

**Files:**
- Modify: `hooks/useDaily.ts`

**Interfaces:**
- Consumes: `useSupabaseAuth()` (Task 5), `createBrowserSupabaseClient()` (Task 3), `mergeDailyHistory`/`entriesToUpload` (Task 2), existing `DailyHistory`/`DailyResult` from `lib/daily.ts`.
- Produces: `useDaily()` now returns `{ state, dispatch, history, auth, signInWithGoogle, signOut }` — the three new fields consumed by Task 7 (`Diario.tsx`).

This task does not add new pure logic worth a unit test on its own (the merge math is already covered in Task 2; the new code here is effectful glue) — verified via `pnpm typecheck`/`pnpm lint`/existing `hooks`-adjacent test suite staying green, plus the manual browser walkthrough in Task 8.

- [ ] **Step 1: Add imports and a `persistHistory` helper**

In `hooks/useDaily.ts`, extend the import block (currently lines 1–12) — add these three imports:

```ts
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
```

(replaces the existing `useEffect, useMemo, useReducer, useState` import — adds `useRef`)

```ts
import { entriesToUpload, mergeDailyHistory } from "../lib/daily-sync";
import { createBrowserSupabaseClient } from "../lib/supabase";
import { useSupabaseAuth } from "./useSupabaseAuth";
```

Then replace `writeHistoryEntry` (current lines 63–69):

```ts
function writeHistoryEntry(base: DailyHistory, dateKey: string, result: DailyResult): DailyHistory {
  const history = { ...base, [dateKey]: result };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
  return history;
}
```

with a `persistHistory` helper plus `writeHistoryEntry` rewritten on top of it (same behavior, but the merge-many path in Step 3 needs the bulk version too):

```ts
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

- [ ] **Step 2: Add a row-shape type for the Supabase select**

Right after the `DailyWordStorage` interface (current lines 71–74), add:

```ts
interface DailyResultRow {
  readonly date_key: string;
  readonly status: "solved" | "failed";
  readonly score: number;
  readonly guesses: DailyResult["guesses"];
  readonly hints: DailyResult["hints"];
}
```

- [ ] **Step 3: Call `useSupabaseAuth` and add the sign-in merge effect**

In the `useDaily()` function body, right after `const [history, setHistory] = useState<DailyHistory>({});` (current line 239), add:

```ts
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const historyRef = useRef(history);
  historyRef.current = history;
```

Then, after the existing hydration `useEffect` (current lines 241–265, the one that reads `localStorage` and dispatches `HYDRATE`), add a new effect:

```ts
  // Al iniciar sesión (o al montar ya con sesión activa), fusiona el
  // historial remoto sobre el local y sube lo que falte en remoto — sin
  // botón, automático (ver spec §"Cambios en hooks/useDaily.ts"). Best-effort:
  // un fallo de red aquí no bloquea nada, se reintenta solo (entriesToUpload
  // vuelve a detectar lo no subido) la próxima vez que este efecto corra con
  // sesión activa. historyRef evita depender de `history` en el array de
  // deps — evitaría reejecutar este efecto en cada partida jugada.
  useEffect(() => {
    if (auth.status !== "signed-in" || !auth.userId) return;
    const userId = auth.userId;
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    supabase
      .from("daily_results")
      .select("date_key, status, score, guesses, hints")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;

        const remote: DailyHistory = {};
        for (const row of data as DailyResultRow[]) {
          remote[row.date_key] = { status: row.status, score: row.score, guesses: row.guesses, hints: row.hints };
        }

        const toUpload = entriesToUpload(historyRef.current, remote);
        const rows = Object.entries(toUpload).map(([dateKey, result]) => ({
          user_id: userId,
          date_key: dateKey,
          status: result.status,
          score: result.score,
          guesses: result.guesses,
          hints: result.hints,
        }));
        if (rows.length > 0) {
          supabase.from("daily_results").insert(rows).then(() => {}, () => {});
        }

        setHistory((current) => persistHistory(mergeDailyHistory(current, remote)));
      });

    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.userId]);
```

- [ ] **Step 4: Push today's result to Supabase in the existing completion effect**

The completion effect (current lines 267–277) is:

```ts
  useEffect(() => {
    const round = state.round;
    if (state.phase !== "result" || !round || round.status === "playing") return;
    if (history[state.dateKey]) return;
    const status = round.status;
    const result: DailyResult = { guesses: round.guesses, hints: round.hints, status, score: round.score ?? 0 };
    setHistory((current) => writeHistoryEntry(current, state.dateKey, result));
  }, [state.phase, state.round, state.dateKey, history]);
```

Replace it with:

```ts
  useEffect(() => {
    const round = state.round;
    if (state.phase !== "result" || !round || round.status === "playing") return;
    if (history[state.dateKey]) return;
    const status = round.status;
    const result: DailyResult = { guesses: round.guesses, hints: round.hints, status, score: round.score ?? 0 };
    setHistory((current) => writeHistoryEntry(current, state.dateKey, result));

    // Subida best-effort del resultado de hoy — si falla (sin red, sesión
    // caducada) no se reintenta aquí mismo: el efecto de arriba la recogerá
    // sola la próxima vez que corra con sesión activa (entriesToUpload la
    // seguirá viendo como no subida).
    if (auth.status === "signed-in" && auth.userId) {
      const supabase = createBrowserSupabaseClient();
      supabase
        .from("daily_results")
        .insert({
          user_id: auth.userId,
          date_key: state.dateKey,
          status,
          score: result.score,
          guesses: result.guesses,
          hints: result.hints,
        })
        .then(() => {}, () => {});
    }
  }, [state.phase, state.round, state.dateKey, history, auth.status, auth.userId]);
```

- [ ] **Step 5: Return the new fields**

Change the function's return type and final `return` statement. Current signature:

```ts
export function useDaily(): {
  state: DailyState;
  dispatch: Dispatch<DailyAction>;
  history: DailyHistory;
} {
```

becomes:

```ts
export function useDaily(): {
  state: DailyState;
  dispatch: Dispatch<DailyAction>;
  history: DailyHistory;
  auth: ReturnType<typeof useSupabaseAuth>["auth"];
  signInWithGoogle: () => void;
  signOut: () => void;
} {
```

And the final line (current line 325):

```ts
  return { state, dispatch, history: displayHistory };
```

becomes:

```ts
  return { state, dispatch, history: displayHistory, auth, signInWithGoogle, signOut };
```

- [ ] **Step 6: Typecheck, lint, run full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run`
Expected: PASS — all existing tests (including `daily.test.ts`'s `computeDailyStats` suite) stay green since `DailyState`/`DailyHistory` shapes are unchanged, only new fields were added to the hook's return value.

- [ ] **Step 7: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add hooks/useDaily.ts
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "hooks/useDaily.ts: fusiona historial remoto al iniciar sesión, sube resultados best-effort"
```

---

### Task 7: Account button in `components/screens/Diario.tsx`

**Files:**
- Modify: `components/screens/Diario.tsx`

**Interfaces:**
- Consumes: `auth`, `signInWithGoogle`, `signOut` from `useDaily()` (Task 6); `isSupabaseConfigured()` from `lib/supabase.ts` (Task 3).

- [ ] **Step 1: Import `isSupabaseConfigured` and destructure the new fields**

Current line 5–7:

```ts
import { useDaily } from "../../hooks/useDaily";
import { useTheme } from "../../hooks/useTheme";
import { buildShareText } from "../../lib/daily";
```

Add, right after:

```ts
import { isSupabaseConfigured } from "../../lib/supabase";
```

Current line 40:

```ts
  const { state, dispatch, history } = useDaily();
```

becomes:

```ts
  const { state, dispatch, history, auth, signInWithGoogle, signOut } = useDaily();
```

- [ ] **Step 2: Add the account button next to the theme toggle**

Current header block (lines 97–112):

```tsx
      <div className="flex w-full max-w-xs items-center justify-between">
        <Link href="/" aria-label="Volver" className="font-mono text-lg text-text-muted">
          ←
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Diario · {state.dateKey}
        </span>
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

becomes:

```tsx
      <div className="flex w-full max-w-xs items-center justify-between">
        <Link href="/" aria-label="Volver" className="font-mono text-lg text-text-muted">
          ←
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Diario · {state.dateKey}
        </span>
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() && (
            <button
              type="button"
              onClick={auth.status === "signed-in" ? signOut : signInWithGoogle}
              aria-label={auth.status === "signed-in" ? "Cerrar sesión" : "Iniciar sesión con Google"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
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
      </div>
```

- [ ] **Step 3: Update the header doc comment**

Current comment block (lines 19–30) ends with a sentence about `DailyStats`. Append one more sentence after it:

```ts
 * Cuenta (Google vía Supabase Auth, opcional — ver
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md): el
 * botón de sesión solo aparece si isSupabaseConfigured() es true; sin eso
 * configurado, Diario funciona exactamente igual que antes, 100% local.
 */
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" add components/screens/Diario.tsx
git -c user.name="Miguel" -c user.email="xtremzmiguel@gmail.com" commit -m "Diario.tsx: botón de sesión Google, visible solo con Supabase configurado"
```

---

### Task 8: Full verification + build

**Files:** none (verification only).

- [ ] **Step 1: Full check**

Run: `pnpm typecheck && pnpm lint && pnpm test -- --run && pnpm build`
Expected: all four PASS. `pnpm build` in particular catches any Next.js App Router route-handler signature mistakes in `app/auth/callback/route.ts` that `tsc`/`vitest` alone wouldn't.

- [ ] **Step 2: Confirm the app still runs with zero Supabase env vars**

Run: `pnpm dev` (or reuse a running dev server), open `/diario` in a browser.
Expected: page loads and plays exactly as before this plan — no account button visible (since `.env.local` has no Supabase vars yet), no console errors mentioning `supabase` or `Falta la variable de entorno`.

If browser tooling isn't available in this session (Playwright/Chrome MCP were disconnected in the prior session), state that explicitly instead of claiming this was verified — same disclosure discipline as the rest of this project's recent work.

- [ ] **Step 3: Note what's still blocked on Miguel**

Nothing further to code. The real Google login round-trip (`signInWithGoogle` → Google consent → `/auth/callback` → session cookie → Diario merge) can only be exercised end-to-end once Miguel completes the manual checklist already written at the bottom of the spec (`docs/superpowers/specs/2026-08-28-diario-account-sync-design.md`):
1. Create the Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Enable the Google provider in Supabase Authentication → Providers, with Google Cloud OAuth credentials.
4. Copy `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` into `.env.local` and into Vercel's project env vars.

- [ ] **Step 4: Final commit (if Steps 1–2 required any fixes)**

Only if verification turned up something to fix — otherwise this task produces no diff and no commit.

---

## Self-Review Notes

- **Spec coverage:** every piece named in the spec's "Piezas de código" section has a task — `lib/supabase.ts` (Task 3), `app/auth/callback/route.ts` (Task 4), `hooks/useSupabaseAuth.ts` (Task 5), `lib/daily-sync.ts` (Task 2), `hooks/useDaily.ts` changes (Task 6), `Diario.tsx` changes (Task 7), SQL schema + env vars + packages (Task 1). The spec's "Testing" section's stated scope (`lib/daily-sync.ts` gets unit tests; hook/component changes get browser verification, no component tests) is followed exactly.
- **Deliberate spec tightening:** the spec didn't specify what happens when Supabase env vars are absent during normal development (before Miguel's checklist). This plan adds `isSupabaseConfigured()` as a hard gate so the app never throws and the account UI stays invisible until real infra exists — consistent with the spec's own "login opcional, nunca obligatorio" principle, just made explicit for the zero-config case.
- **Type consistency check:** `AuthState`, `DailyResultRow`, `DailyHistory`, `DailyResult` names and shapes are used identically across Tasks 5–7 (`useSupabaseAuth`'s `AuthState` return type is referenced via `ReturnType<typeof useSupabaseAuth>["auth"]` in Task 6 rather than re-declared, to guarantee they can't drift).
