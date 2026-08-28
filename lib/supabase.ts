import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase — factory de cliente (browser) siguiendo @supabase/ssr
 * (ver docs/superpowers/specs/2026-08-28-diario-account-sync-design.md). La
 * factory de servidor vive en lib/supabase-server.ts (importa next/headers,
 * que no puede llegar al bundle de cliente). El login es opcional: si Miguel
 * no ha creado el proyecto Supabase todavía, isSupabaseConfigured() es false
 * y NINGÚN llamador debe crear un cliente — createBrowserSupabaseClient()
 * lanza si se llama sin las env vars. hooks/useSupabaseAuth.ts y
 * components/screens/Diario.tsx comprueban isSupabaseConfigured() antes de
 * tocar la factory de browser, así que ese lanzamiento nunca ocurre en la
 * práctica — es un guardrail, no el mecanismo principal. (La factory de
 * servidor tiene su propio guardián: app/auth/callback/route.ts, ver el
 * comentario de lib/supabase-server.ts.)
 */

/**
 * Las dos env vars se leen SOLO a través de este objeto, con acceso estático
 * (`process.env.NOMBRE_LITERAL`). Next.js/Turbopack sustituye ese acceso
 * estático por el valor literal al compilar el bundle de cliente, pero NO
 * sustituye el acceso dinámico (`process.env[name]`) — en el navegador
 * `process.env` es un shim vacío, así que un acceso computado devolvería
 * siempre undefined. Rutar isSupabaseConfigured() y requireEnv() por aquí
 * garantiza que las dos vean exactamente lo mismo: sin esto, con las vars
 * configuradas de verdad, isSupabaseConfigured() sería true (literal
 * inlineado) mientras requireEnv() lanzaría en el navegador.
 */
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.NEXT_PUBLIC_SUPABASE_URL) && Boolean(ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function requireEnv(name: keyof typeof ENV): string {
  const value = ENV[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} — ver checklist manual en el spec de account-sync.`);
  }
  return value;
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}
