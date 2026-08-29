# Pantalla de Perfil — diseño

## Contexto

Hoy la cuenta Google (Supabase Auth, ver `2026-08-28-diario-account-sync-design.md`)
solo tiene un punto de entrada: un icon-button en `Diario.tsx` (◐/○) que hace
login/logout directo, sin pantalla propia. El resto de la app (Home, Setup,
Play/Solo-Duelo) no sabe nada de cuentas.

Miguel pidió un botón de perfil persistente, junto al toggle de tema, que
abra una pantalla de perfil. Se decidió con Miguel:

1. **Alcance de datos**: solo cuenta Google + estadísticas de Diario (racha,
   calendario — ya existen vía `DailyStats`). Solo/Duelo no tienen ninguna
   persistencia hoy (ni local ni remota) y Duelo ni siquiera está construido
   (sigue "Próximamente" en Sprint 2) — sus estadísticas quedan fuera de
   alcance, para cuando esos modos tengan persistencia real.
2. **Dónde va el botón**: Home, Setup, Play (cubre Solo y Duelo, incluye la
   pantalla de Reveal que Play renderiza) y Diario — reemplazando ahí el
   icon-button de cuenta existente. Nunca sobre el grid de juego en sí
   (fondo oscuro fijo, `data-theme="dark"`, no es donde vive el header).
3. **Setup y Play no tienen toggle de tema hoy** (solo Home y Diario) — se
   agrega ahí también, junto al botón de perfil nuevo, por consistencia.

## Decisiones de arquitectura

- **Perfil es un overlay controlado, no una fase del motor.** Mismo patrón
  que `HowToPlay.tsx` (`fixed inset-0`, `role="dialog"`, cierra con ✕ o
  Escape, focus trap) — nunca entra en `GameState.phase` ni en
  `DailyState.phase`. Cuenta es una preocupación transversal, no de juego.
- **Un solo componente de botón, reutilizado en las 4 pantallas.**
  `components/ui/ProfileButton.tsx` — icon-button con el mismo estilo visual
  que el toggle de tema existente (`h-9 w-9 rounded-full border border-line`),
  recibe `onClick` y listo. Cada screen decide cuándo montarlo (todas, tras
  este cambio) y le pasa su propio `open`/`onClose` de perfil.
- **Sin Context de auth nuevo.** Precedente ya existente en el código:
  `useTheme()` se llama independientemente en cada screen que lo necesita
  (Home y Diario hoy). `useSupabaseAuth()` sigue el mismo patrón — Home,
  Setup y Play lo llaman directo; Diario ya lo tiene vía `useDaily()` (no
  se duplica ahí). Cada llamada crea su propio listener de Supabase, barato
  y ya es el patrón establecido — no se introduce un Provider para esto.
- **Profile NO vuelve a montar `useDaily()` completo.** Ese hook dispara
  fetch de palabra-pista, sync remoto con guard anti-contaminación, hidrata
  el reducer del día — todo innecesario solo para LEER el historial ya
  persistido. En vez de eso: se extraen los helpers de storage puro
  (`readHistory`, `persistHistory`, `writeHistoryEntry`,
  `DAILY_HISTORY_STORAGE_KEY`) de `hooks/useDaily.ts` a un nuevo
  `lib/daily-storage.ts` — funciones puras sin React, mismo espíritu que
  `lib/daily-sync.ts`. `hooks/useDaily.ts` las importa desde ahí sin cambiar
  su propio comportamiento. Profile.tsx importa `readHistory` directo y lee
  el snapshot al abrir — sin fetch remoto propio, sin duplicar el guard de
  cambio de cuenta (ese vive solo en el efecto de `useDaily.ts`, que sigue
  siendo el único que escribe hacia Supabase).
- **`AuthState` gana un campo `email`.** Hoy solo tiene `userId` — se añade
  `email: string | null`, poblado desde `session.user.email` en los mismos
  dos sitios donde ya se lee `session.user.id` (`getSession` y
  `onAuthStateChange`, en `hooks/useSupabaseAuth.ts`). Solo para mostrarlo en
  Profile — no cambia ninguna lógica de sync.

## Componentes nuevos

### `components/ui/ProfileButton.tsx`
```ts
interface ProfileButtonProps { readonly signedIn: boolean; readonly onClick: () => void; }
```
Icon-button `◐` (signedIn) / `○` (no) — mismo glifo que ya usaba el botón de
cuenta de Diario, mismo estilo visual que el toggle de tema. Sin lógica de
auth propia: el screen que lo monta le pasa `auth.status === "signed-in"` y
decide si mostrarlo (gate `isSupabaseConfigured()`, igual que hoy).

### `components/screens/Profile.tsx`
```ts
interface ProfileProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly auth: AuthState;
  readonly signInWithGoogle: () => void;
  readonly signOut: () => void;
}
```
Overlay igual que `HowToPlay.tsx` (dialog, focus trap, Escape). Contenido:
- **Sin sesión**: texto breve + `<Button onClick={signInWithGoogle}>Iniciar sesión con Google</Button>`.
- **Con sesión**: `auth.email` (o "Sesión iniciada" si por lo que sea viene
  null) + `<Button variant="secondary" onClick={signOut}>Cerrar sesión</Button>`.
- **Estadísticas de Diario**: siempre visibles (con o sin sesión — el
  historial local existe independientemente de la cuenta). Lee
  `readHistory()` de `lib/daily-storage.ts` al abrir (`useEffect` disparado
  por `open`), pasa el resultado + `localDateKey(new Date())` a
  `<DailyStats history={...} todayKey={...} />` (componente ya existente,
  sin cambios).
- Si `!isSupabaseConfigured()`: la sección de cuenta no se muestra en
  absoluto (solo estadísticas) — pero como el botón que abre Profile ya está
  gateado por `isSupabaseConfigured()` en cada screen, este caso en la
  práctica no ocurre; se documenta como defensivo, no como ruta real.

## Cambios en screens existentes

- **`Home.tsx`**: `const [profileOpen, setProfileOpen] = useState(false)` +
  `useSupabaseAuth()` + `<ProfileButton>` junto al toggle de tema existente
  + `<Profile .../>` al final, igual que ya hace con `<HowToPlay/>`.
- **`Setup.tsx`**: mismo patrón — gana toggle de tema (no lo tenía) +
  `useSupabaseAuth()` + `ProfileButton` + `Profile`, en el header junto al
  botón "?" existente.
- **`Play.tsx`**: mismo patrón, en el header row que ya es compartido entre
  `isPlaying` y `Reveal` (cubre Solo y Duelo, y su pantalla de resultado, sin
  tocar `Reveal.tsx` — el header vive en el padre).
- **`Diario.tsx`**: reemplaza el icon-button ◐/○ actual por
  `<ProfileButton>` + `<Profile auth={auth} signInWithGoogle={signInWithGoogle} signOut={signOut} .../>`
  — reutiliza el `auth`/`signInWithGoogle`/`signOut` que `useDaily()` ya
  devuelve, sin llamar `useSupabaseAuth()` aparte.

## Fuera de alcance (explícito)

- Estadísticas de Solo o Duelo — no existe persistencia para esos modos.
- Edición de perfil, avatar, nombre — Google no da mucho más que email vía
  Supabase Auth sin scopes adicionales; no se pide.
- Borrar cuenta / borrar historial remoto — el schema no tiene policy de
  delete (decisión ya tomada en el spec de account-sync); fuera de alcance
  aquí también.

## Testing

- `lib/daily-storage.ts` (extraído): mismo nivel de test que
  `lib/daily-sync.ts` — funciones puras, tests directos sobre
  localStorage mockeado si hace falta (o se heredan los tests que ya cubrían
  este código dentro de `useDaily.ts`, si los había — revisar al implementar).
- El resto (overlay UI, botones) sigue el patrón ya establecido del
  proyecto: sin tests de componente/hook (ver Sprint 2 plan) — verificación
  manual/Playwright: abrir Profile desde las 4 pantallas, sign-in/sign-out,
  estadísticas se ven, cierra con ✕ y Escape, toggle de tema nuevo en
  Setup/Play funciona.
