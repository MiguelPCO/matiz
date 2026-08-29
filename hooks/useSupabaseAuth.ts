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
  readonly email: string | null;
}

const SIGNED_OUT: AuthState = { status: "signed-out", userId: null, email: null };

export function useSupabaseAuth(): {
  readonly auth: AuthState;
  readonly signInWithGoogle: () => void;
  readonly signOut: () => void;
} {
  const configured = isSupabaseConfigured();
  const [auth, setAuth] = useState<AuthState>(
    configured ? { status: "loading", userId: null, email: null } : SIGNED_OUT,
  );
  const supabase = useMemo(() => (configured ? createBrowserSupabaseClient() : null), [configured]);

  useEffect(() => {
    if (!supabase) return;

    // Segundo argumento no-op en todos los .then de este archivo: misma
    // disciplina que hooks/useDaily.ts — nada de red lanza hacia la UI, ni
    // siquiera como unhandled rejection. Si getSession falla, el estado se
    // queda como "signed-out" y Diario sigue jugándose en local.
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

    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

  const signInWithGoogle = useCallback(() => {
    if (!supabase) return;
    // Round-trip la página de origen vía ?next= para que el callback pueda
    // devolver al usuario donde estaba (Home/Setup/Play/Diario) en vez de
    // aterrizar siempre en Diario — ver finding 1 de la revisión final de
    // Profile screen (docs/superpowers/specs/2026-08-29-profile-screen-design.md).
    const next = encodeURIComponent(window.location.pathname);
    supabase.auth
      .signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${next}` },
      })
      .then(() => {}, () => {});
  }, [supabase]);

  const signOut = useCallback(() => {
    if (!supabase) return;
    supabase.auth.signOut().then(() => {}, () => {});
  }, [supabase]);

  return { auth, signInWithGoogle, signOut };
}
