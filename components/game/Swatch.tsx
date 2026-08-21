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
  const transitionClass = disabled ? "" : "transition-transform duration-150";

  return (
    <button
      type="button"
      onClick={() => onTap(row, col)}
      disabled={disabled}
      data-row={row}
      data-col={col}
      data-target={isTarget ? "" : undefined}
      aria-label={`Fila ${row + 1}, columna ${col + 1}`}
      className={`relative aspect-square rounded-[var(--radius-swatch)] ${transitionClass} disabled:cursor-default enabled:active:scale-95 after:absolute after:-inset-[6px] after:content-[''] ${
        isTarget ? "ring-2 ring-signal ring-offset-2 ring-offset-surface-2" : ""
      } ${disabled && !isTarget ? "opacity-[0.35]" : ""}`}
      style={{
        backgroundColor: hex,
        boxShadow: !isTarget && guessed ? "inset 0 0 0 2px var(--color-text-faint)" : undefined,
      }}
    />
  );
}
