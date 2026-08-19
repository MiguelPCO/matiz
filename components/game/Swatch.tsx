"use client";

import type { Hex } from "../../lib/types";

interface SwatchProps {
  readonly hex: Hex;
  readonly row: number;
  readonly col: number;
  readonly guessed: boolean;
  readonly isTarget: boolean;
  readonly disabled: boolean;
  readonly onTap: (row: number, col: number) => void;
}

export function Swatch({ hex, row, col, guessed, isTarget, disabled, onTap }: SwatchProps) {
  return (
    <button
      type="button"
      onClick={() => onTap(row, col)}
      disabled={disabled}
      aria-label={`Fila ${row + 1}, columna ${col + 1}`}
      className={`aspect-square rounded-[var(--radius-swatch)] transition-transform duration-150 disabled:cursor-default enabled:active:scale-95 ${
        isTarget ? "ring-2 ring-signal ring-offset-2 ring-offset-surface-2" : ""
      }`}
      style={{
        backgroundColor: hex,
        boxShadow: !isTarget && guessed ? "inset 0 0 0 2px var(--color-text-faint)" : undefined,
      }}
    />
  );
}
