import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

/**
 * Callback OAuth de Supabase Auth (Google) — intercambia el `code` de la
 * URL por una sesión y la deja en cookies (vía createServerSupabaseClient),
 * luego redirige a Diario. Sin este route handler el login con Google
 * nunca completa (ver checklist manual en
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md).
 *
 * Este handler es el ÚNICO llamador de createServerSupabaseClient(), así que
 * es aquí donde vive el guard de isSupabaseConfigured(): sin env vars, una
 * visita manual/marcador a /auth/callback simplemente redirige a Diario en
 * vez de reventar con un 500 desde requireEnv().
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/diario`);
  }

  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/diario`);
}
