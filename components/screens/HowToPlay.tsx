"use client";

import { useEffect, useRef } from "react";
import { Label } from "../ui/Label";

interface HowToPlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/**
 * S6 — no es una fase de GameState (SCHEMA §7 no tiene estado "howtoplay"):
 * overlay controlado localmente por quien la invoca, nunca automática.
 */
export function HowToPlay({ open, onClose }: HowToPlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      aria-label="Cómo se juega"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface-0/95 px-4 pt-10 pb-6"
    >
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between">
          <Label>Cómo se juega</Label>
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

        <div className="flex flex-col gap-4">
          <div>
            <p className="font-sans text-lg text-text">Lee los ejes.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              La carta rotula sus ejes siempre: horizontal es luminosidad (oscuro → claro),
              vertical es intensidad de color (vivo → apagado). No hay truco que aprender, solo
              hay que mirar.
            </p>
          </div>

          <div>
            <p className="font-sans text-lg text-text">El termómetro dice cuánto, no dónde.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              Tras cada tiro, la barra indica qué tan cerca estás del matiz exacto — nunca en qué
              dirección. Encontrarlo es cosa tuya.
            </p>
          </div>

          <div>
            <p className="font-sans text-lg text-text">Tienes 3 tiros.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              Pide pistas si te hacen falta — cada una resta puntos. Tú decides si te compensa.
            </p>
          </div>

          <div>
            <p className="font-sans text-lg text-text">Sobre el daltonismo.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              MATIZ es un juego de discriminación cromática — por naturaleza, no es accesible para
              daltonismo severo. El eje horizontal de la carta (luminosidad) sigue siendo legible
              sin percibir color, y eso ayuda, pero no lo resuelve. Preferimos decirlo claro a
              fingir que no es un problema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
