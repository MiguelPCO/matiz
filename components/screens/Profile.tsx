"use client";

import { useEffect, useRef, useState } from "react";
import { localDateKey } from "../../lib/daily";
import { readHistory } from "../../lib/daily-storage";
import type { DailyHistory } from "../../lib/daily";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<DailyHistory>({});

  useEffect(() => {
    if (open) setHistory(readHistory());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Perfil"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-0/95 px-4 pt-10 pb-6"
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between">
          <Label>Perfil</Label>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="font-mono text-lg text-text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-surface-1 p-4">
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
            </>
          )}
        </div>

        <DailyStats history={history} todayKey={localDateKey(new Date())} />
      </div>
    </div>
  );
}
