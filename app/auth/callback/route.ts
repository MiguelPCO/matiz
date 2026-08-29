import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

/**
 * Callback OAuth de Supabase Auth (Google) — intercambia el `code` de la
 * URL por una sesión y la deja en cookies (vía createServerSupabaseClient),
 * luego redirige de vuelta a donde el usuario inició sesión (o a Diario si
 * no hay `next`). Sin este route handler el login con Google nunca completa
 * (ver checklist manual en docs/superpowers/specs/2026-08-28-diario-account-sync-design.md).
 *
 * Este handler es el ÚNICO llamador de createServerSupabaseClient(), así que
 * es aquí donde vive el guard de isSupabaseConfigured(): sin env vars, una
 * visita manual/marcador a /auth/callback simplemente redirige a Diario en
 * vez de reventar con un 500 desde requireEnv().
 *
 * `next` (finding 1 de la revisión final de Profile screen, ver
 * docs/superpowers/specs/2026-08-29-profile-screen-design.md): ahora que el
 * botón de sesión vive en Home/Setup/Play además de Diario,
 * hooks/useSupabaseAuth.ts manda `?next=<pathname-de-origen>` al pedir el
 * OAuth. Se valida aquí como ruta interna (empieza por "/", no empieza por
 * "//") antes de usarla como destino — cualquier otra cosa (URL absoluta,
 * protocol-relative "//evil.com") se descarta para evitar un open redirect,
 * y se cae de vuelta a /diario.
 */
function resolveRedirectPath(next: string | null): string {
  if (!next) return "/diario";
  if (!next.startsWith("/") || next.startsWith("//")) return "/diario";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const redirectPath = resolveRedirectPath(searchParams.get("next"));

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}${redirectPath}`);
  }

  const code = searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${redirectPath}`);
}
