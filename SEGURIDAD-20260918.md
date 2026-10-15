# Seguridad — 18/09/2026

## Legal y CAPTCHA

### Hecho
- `lib/legal.ts`: datos del titular (una sola constante).
- `/privacidad` y `/aviso-legal` (`app/privacidad/page.tsx`, `app/aviso-legal/page.tsx`). Son públicas: no hay middleware ni guards de rutas.
- Enlaces: pie de la Home y aviso «Al crear una cuenta aceptas…» bajo el botón «Iniciar sesión con Google» del Perfil.
- La política dice que la palabra de Solo o el color de la partida se envían a Anthropic (`/api/word-color`, `/api/color-word`).
- Proveedores reales: Supabase, Vercel (hosting + Analytics + Speed Insights, sin cookies), Anthropic, Google (login).
- **CAPTCHA no hace falta**: el único login es Google OAuth (`signInWithOAuth`), que Supabase no protege con CAPTCHA. No hay `signUp`, `signInWithPassword`, OTP ni reset. Si algún día se añade login por email, hay que poner Turnstile en ese formulario antes de activar el CAPTCHA en Supabase.

### Miguel tiene que hacer
- Rellenar apellidos, NIF y domicilio en `lib/legal.ts`.
- Rellenar la región del proyecto Supabase en `/privacidad` (buscar `[RELLENAR]`).

### Falta
- Borrar la cuenta desde la app: hoy no se puede; la política dice que se pida por email.
