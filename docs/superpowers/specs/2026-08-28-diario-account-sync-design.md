# Diario: cuentas y sincronización de estadísticas — diseño

**Fecha:** 2026-08-28
**Estado:** aprobado por Miguel (2026-08-28), pendiente de plan de implementación.

## Contexto

`DailyStats` (commit `2384748`) calcula racha/mejor racha/% victorias/calendario a
partir de `matiz-daily-history-v1` en `localStorage` — por navegador, no
compartido entre dispositivos. Miguel pidió una forma de guardar esas
estadísticas "con una cuenta o de otra forma" para que persistan entre
dispositivos.

## Decisiones confirmadas (AskUserQuestion, 2026-08-28)

1. **Login: Google OAuth.** Sin contraseñas ni email que gestionar.
2. **Base de datos: Supabase** (Postgres gestionado).
3. **Auth: Supabase Auth**, no Auth.js aparte — un solo proveedor para login
   + datos, menos piezas moviéndose. Supabase Auth soporta Google OAuth de
   forma nativa.
4. **Login opcional, nunca obligatorio.** Diario se sigue jugando sin cuenta
   exactamente como ahora (`localStorage`). Iniciar sesión es un extra, no
   un requisito para jugar.
5. **`localStorage` sigue siendo la fuente rápida/offline** de la que vive el
   juego — nunca bloquea gameplay esperando red. Supabase es una capa de
   sincronización *por encima*, no un reemplazo.

## Fuera de alcance (explícitamente, no construir esto ahora)

- Estadísticas de Solo/Duelo — esta cuenta solo sincroniza `DailyResult` de
  Diario, no partidas de Solo/Duelo (que no tienen historial persistido hoy).
- Sincronización en tiempo real entre pestañas/dispositivos abiertos a la
  vez (sin websockets/Realtime) — el fetch de historial remoto ocurre solo
  al cargar Diario o justo tras iniciar sesión, no en vivo.
- Borrar cuenta / exportar datos / GDPR tooling.
- Otros proveedores de login (email, GitHub, etc.) — solo Google por ahora.
- Provisión real de infraestructura (crear el proyecto Supabase, activar el
  proveedor Google, credenciales OAuth de Google Cloud) — eso lo hace
  Miguel manualmente, ver "Checklist manual" al final. El código asume que
  esas piezas ya existen vía variables de entorno.

## Esquema de base de datos

Una tabla, clave primaria compuesta por usuario+fecha (un `DailyResult` por
usuario por día, igual que la clave de `matiz-daily-history-v1`):

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

`guesses`/`hints` se guardan tal cual (mismo shape que `Guess[]`/`Hint[]` de
`lib/types.ts`) — permite en el futuro reconstruir el `Reveal` completo de
un día pasado sin más columnas, aunque hoy no se use para eso.

## Paquetes nuevos

- `@supabase/supabase-js` — cliente Supabase.
- `@supabase/ssr` — helpers oficiales para Next.js App Router (cliente de
  browser + cliente de servidor con cookies, necesario para el callback de
  OAuth).

## Variables de entorno

`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — públicas por
diseño de Supabase (protegidas por RLS, no por secretismo de la key). Añadir
a `.env.local.example` junto a `ANTHROPIC_API_KEY`.

## Piezas de código

### `lib/supabase.ts` (nuevo)
Dos factories, siguiendo el patrón oficial de `@supabase/ssr`:
- `createBrowserSupabaseClient()` — para componentes cliente (`"use client"`).
- `createServerSupabaseClient()` — para el route handler del callback,
  usando cookies de `next/headers`.

### `app/auth/callback/route.ts` (nuevo)
Route handler que intercambia el código OAuth por una sesión (patrón
estándar `exchangeCodeForSession`), luego redirige a `/diario`.

### `hooks/useSupabaseAuth.ts` (nuevo)
```ts
interface AuthState {
  readonly status: "loading" | "signed-out" | "signed-in";
  readonly userId: string | null;
}
function useSupabaseAuth(): {
  readonly auth: AuthState;
  readonly signInWithGoogle: () => void;
  readonly signOut: () => void;
}
```
Se suscribe a `supabase.auth.onAuthStateChange`, expone el estado + dos
acciones. `signInWithGoogle` llama a `signInWithOAuth({provider:'google',
options:{redirectTo: `${origin}/auth/callback`}})`.

### `lib/daily-sync.ts` (nuevo) — funciones puras, con tests
Igual que `computeDailyStats` en `lib/daily.ts`, la lógica de fusión debe
ser pura y testeable sin tocar Supabase de verdad:

```ts
/** Fusiona historial local + remoto: el remoto gana si ambos tienen la
 * misma fecha (ya sincronizado desde otro dispositivo); las fechas que
 * solo existen en uno de los dos se incluyen tal cual. */
export function mergeDailyHistory(local: DailyHistory, remote: DailyHistory): DailyHistory

/** De un historial local + uno remoto, qué entradas locales hay que subir
 * (existen en local pero no en remote) — usado para la migración al
 * iniciar sesión por primera vez y como reconciliación general. */
export function entriesToUpload(local: DailyHistory, remote: DailyHistory): DailyHistory
```

### Cambios en `hooks/useDaily.ts`
- Usa `useSupabaseAuth()` internamente.
- Nuevo efecto: cuando `auth.status === "signed-in"` (incluida la
  transición desde `signed-out`), hace `select` de todas las filas de
  `daily_results` del usuario, las convierte a `DailyHistory`, calcula
  `entriesToUpload(historyLocal, historyRemoto)` y hace `insert` en bloque
  de esas filas (la migración es automática, sin botón — decisión
  confirmada). Luego `setHistory(mergeDailyHistory(historyLocal,
  historyRemoto))`.
- El efecto de escritura al completar el día de hoy (ya existente) gana un
  segundo paso: si `auth.status === "signed-in"`, además de
  `writeHistoryEntry` en `localStorage`, hace `insert` (no `upsert` — un día
  ya jugado no se reescribe, ver policy de arriba) del resultado en
  Supabase. Ese `insert` es best-effort: si falla (sin red, sesión
  caducada...) no bloquea nada — el dato ya está en `localStorage` y se
  reintentará solo la próxima vez que `useDaily` monte con sesión activa
  (gracias a `entriesToUpload` en el efecto de arriba, que detecta que esa
  fecha sigue sin subir).
- `useDaily()` devuelve también `auth` (para que Diario.tsx pinte el botón
  de sesión).

### Cambios en `components/screens/Diario.tsx`
Botón de cuenta junto al de tema: icono de Google/avatar si `signed-in`
(con opción de cerrar sesión), botón "Iniciar sesión" si `signed-out`. Sin
cambios en el resto del flujo — `DailyStats` sigue recibiendo `history` tal
cual, ya fusionado.

## Manejo de errores

Todo lo de red (fetch remoto, insert, OAuth) sigue la misma disciplina que
`lib/word-color.ts`/`lib/color-word.ts`: nunca lanza, nunca bloquea la UI de
juego. Un fallo de sincronización dura como mucho hasta el siguiente mount
con sesión activa — no hay estado de error visible para esto, es
best-effort silencioso (igual que la caché de la palabra-pista de Diario ya
lo es).

## Testing

`lib/daily-sync.ts` (`mergeDailyHistory`, `entriesToUpload`) son funciones
puras — tests unitarios normales, sin mocks de red, siguiendo SCHEMA §11
(solo `lib/` necesita cobertura automática). `hooks/useSupabaseAuth.ts` y
los cambios en `useDaily.ts`/`Diario.tsx` se verifican por walkthrough en
navegador (Playwright/Chrome), como el resto de hooks de este proyecto — no
hay tests de componentes en esta base de código (decisión ya tomada en
Sprint 2, ver `MATIZ-SPRINTS.md`).

**Nota:** el flujo de login real (redirect a Google, callback) no se puede
probar de extremo a extremo en este entorno de desarrollo sin credenciales
OAuth reales — mismo caso que `word-color`/`random-word` sin
`ANTHROPIC_API_KEY` (ver `MATIZ-SPRINTS.md`/memoria del proyecto). Se
verificará con mocks de Supabase donde tenga sentido, y con una prueba
manual real de Miguel una vez configurada la infraestructura.

## Checklist manual (Miguel, fuera del código)

1. Crear proyecto en [supabase.com](https://supabase.com) (plan gratuito).
2. Ejecutar el SQL de arriba en el SQL Editor de Supabase.
3. En Supabase → Authentication → Providers, activar Google, con un client
   ID/secret de Google Cloud Console (OAuth consent screen + credenciales
   tipo "Web application"; el redirect URI que pide Google es el que da
   Supabase en esa misma pantalla).
4. Copiar `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` del
   panel de Supabase a `.env.local` y a las variables de entorno del
   proyecto en Vercel.
