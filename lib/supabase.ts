import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase — factory de cliente (browser) siguiendo @supabase/ssr
 * (ver docs/superpowers/specs/2026-08-28-diario-account-sync-design.md). La
 * factory de servidor vive en lib/supabase-server.ts (importa next/headers,
 * que no puede llegar al bundle de cliente). El login es opcional: si Miguel
 * no ha creado el proyecto Supabase todavía, isSupabaseConfigured() es false
 * y NINGÚN llamador debe crear un cliente — createBrowserSupabaseClient()/
 * createServerSupabaseClient() lanzan si se llaman sin las env vars.
 * hooks/useSupabaseAuth.ts y components/screens/Diario.tsx comprueban
 * isSupabaseConfigured() antes de tocar cualquiera de las dos factories, así
 * que ese lanzamiento nunca ocurre en la práctica — es un guardrail, no el
 * mecanismo principal.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} — ver checklist manual en el spec de account-sync.`);
  }
  return value;
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}
