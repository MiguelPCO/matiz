"use client";

import { useEffect, useRef } from "react";

/**
 * Teclado de los overlays modales (HowToPlay, Profile): foco a «Cerrar» al
 * abrir, Escape cierra, Tab no sale del diálogo y el foco vuelve al botón
 * que lo abrió. Un solo dueño: el bug de Tab escapando a la carta (f3cda0e)
 * se arregló en un diálogo y seguía en el otro.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // onClose llega como arrow inline: en ref para que re-renders del padre
  // (p. ej. la pista extra de Play) no re-ejecuten el efecto ni roben el foco.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Foco fuera del diálogo (clic en el texto lo deja en body): devolverlo,
      // o el Tab llegaría a la carta de detrás y podría disparar un tiro.
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
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
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  return { dialogRef, closeRef };
}
