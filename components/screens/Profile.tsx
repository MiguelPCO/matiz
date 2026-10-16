"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDialog } from "../../hooks/useDialog";
import { localDateKey } from "../../lib/daily";
import { readHistory } from "../../lib/daily-storage";
import type { DailyHistory } from "../../lib/daily";
import { isSupabaseConfigured } from "../../lib/supabase";
import type { AuthState } from "../../hooks/useSupabaseAuth";
import { DailyStats } from "../game/DailyStats";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";

interface ProfileProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly auth: AuthState;
  readonly signInWithGoogle: () => void;
  readonly signOut: () => void;
}

/**
 * Overlay controlado, no una fase del motor — mismo patrón que
 * HowToPlay.tsx (ver docs/superpowers/specs/2026-08-29-profile-screen-design.md).
 * Lee el historial de Diario directo de localStorage (lib/daily-storage.ts)
 * en vez de montar useDaily() completo — evita duplicar su fetch de
 * palabra-pista y su efecto de sync remoto. Estadísticas de Solo/Duelo:
 * fuera de alcance (esos modos no persisten nada todavía).
 */
export function Profile({ open, onClose, auth, signInWithGoogle, signOut }: ProfileProps) {
  const { dialogRef, closeRef } = useDialog(open, onClose);
  const [history, setHistory] = useState<DailyHistory>({});

  useEffect(() => {
    if (open) setHistory(readHistory());
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Perfil"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-0/95 px-4 pt-10 pb-6"
    >
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex w-full items-center justify-between">
          <Label>Perfil</Label>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="hit-44 font-mono text-lg text-text-muted"
          >
            ✕
          </button>
        </div>

        {isSupabaseConfigured() && (
          <div className="flex w-full flex-col gap-3 rounded-[var(--radius-panel)] bg-surface-1 p-4">
            {auth.status === "signed-in" ? (
              <>
                <p className="font-sans text-sm text-text">{auth.email ?? "Sesión iniciada"}</p>
                <Button variant="secondary" onClick={signOut}>
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <p className="font-sans text-sm text-text-muted">
                  Inicia sesión para guardar tus estadísticas de Diario en la nube.
                </p>
                <Button variant="secondary" onClick={signInWithGoogle} disabled={auth.status === "loading"}>
                  Iniciar sesión con Google
                </Button>
                <p className="font-sans text-xs text-text-muted">
                  Al crear una cuenta aceptas la{" "}
                  <Link href="/privacidad" className="underline">política de privacidad</Link> y el{" "}
                  <Link href="/aviso-legal" className="underline">aviso legal</Link>.
                </p>
              </>
            )}
          </div>
        )}

        <DailyStats history={history} todayKey={localDateKey(new Date())} />
      </div>
    </div>
  );
}
