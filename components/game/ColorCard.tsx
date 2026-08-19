"use client";

import { Swatch } from "./Swatch";
import type { Grid, Guess } from "../../lib/types";

interface ColorCardProps {
  readonly grid: Grid;
  readonly guesses: readonly Guess[];
  readonly disabled: boolean;
  readonly revealTarget: boolean;
  readonly onTap: (row: number, col: number) => void;
}

/** Carta + swatches + ejes rotulados permanentes (PRD §7.1 — la carta se explica sola). */
export function ColorCard({ grid, guesses, disabled, revealTarget, onTap }: ColorCardProps) {
  const guessedSet = new Set(guesses.map((g) => `${g.row}-${g.col}`));

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          ◀ Oscuro
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Claro ▶
        </span>
      </div>

      <div className="flex gap-2">
        <div
          className="grid flex-1 gap-1 rounded-[var(--radius-panel)] bg-surface-2 p-2"
          style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}
        >
          {grid.cells.flatMap((row) =>
            row.map((cell) => (
              <Swatch
                key={`${cell.row}-${cell.col}`}
                hex={cell.hex}
                row={cell.row}
                col={cell.col}
                guessed={guessedSet.has(`${cell.row}-${cell.col}`)}
                isTarget={revealTarget && cell.row === grid.target.row && cell.col === grid.target.col}
                disabled={disabled}
                onTap={onTap}
              />
            )),
          )}
        </div>
        <div className="flex flex-col justify-between py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint [writing-mode:vertical-rl]">
          <span>Vivo ▲</span>
          <span>Apagado ▼</span>
        </div>
      </div>
    </div>
  );
}
