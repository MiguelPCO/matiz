"use client";

import { useDialog } from "../../hooks/useDialog";
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
  const { dialogRef, closeRef } = useDialog(open, onClose);

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
            className="hit-44 font-mono text-lg text-text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="font-sans text-lg text-text">Lee los ejes.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              La carta tiene sus ejes siempre rotulados. En horizontal va la luminosidad, de oscuro
              a claro, y en vertical la intensidad del color, de vivo a apagado. Con mirarlos ya
              sabes hacia dónde moverte.
            </p>
          </div>

          <div>
            <p className="font-sans text-lg text-text">El termómetro dice cuánto, no dónde.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              Después de cada tiro, la barra marca lo cerca que estás del matiz exacto, pero no
              hacia qué lado queda. Eso lo tienes que descubrir tú.
            </p>
          </div>

          <div>
            <p className="font-sans text-lg text-text">Tienes 3 tiros.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              Puedes pedir pistas cuando te atasques. Cada una resta puntos, así que piensa si te
              compensa.
            </p>
          </div>

          <div>
            <p className="font-sans text-lg text-text">Sobre el daltonismo.</p>
            <p className="mt-1 font-sans text-sm text-text-muted">
              En MATIZ hay que distinguir colores muy parecidos, así que con daltonismo severo es
              muy difícil de jugar. El eje horizontal (la luminosidad) se lee sin percibir el
              color y ayuda algo, pero no basta. Preferimos avisarlo desde el principio.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
