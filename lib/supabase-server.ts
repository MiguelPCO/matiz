import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "./supabase";

/**
 * Cliente Supabase — factory de servidor siguiendo @supabase/ssr (ver
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md). Vive en
 * su propio archivo (separado de lib/supabase.ts) porque importa
 * next/headers, que solo puede aparecer en código server-only — si
 * compartiera archivo con las factories de cliente, Turbopack arrastraría
 * next/headers al bundle de cliente y pnpm build fallaría. El `import
 * "server-only"` de arriba convierte cualquier import accidental desde un
 * componente cliente en un error explícito de build, en vez de repetir en
 * silencio ese mismo bug.
 *
 * El login es opcional: si Miguel no ha creado el proyecto Supabase todavía,
 * isSupabaseConfigured() (en lib/supabase.ts) es false y NINGÚN llamador
 * debe crear un cliente — createServerSupabaseClient() lanza si se llama sin
 * las env vars. El único llamador de esta factory es
 * app/auth/callback/route.ts, que comprueba isSupabaseConfigured() antes de
 * construir nada, así que ese lanzamiento nunca ocurre en la práctica — es
 * un guardrail, no el mecanismo principal.
 */

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
