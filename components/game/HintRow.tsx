"use client";

import type { Hint, HintKind } from "../../lib/types";

interface HintRowProps {
  readonly hints: readonly Hint[];
  readonly maxHints: number;
  readonly hasGuessed: boolean;
  readonly disabled: boolean;
  readonly onRequestHint: (kind: HintKind) => void;
}

const LABELS: Record<HintKind, string> = {
  light: "Claridad",
  sat: "Intensidad",
  dir: "Dirección",
};

const KINDS: readonly HintKind[] = ["light", "sat", "dir"];

export function HintRow({ hints, maxHints, hasGuessed, disabled, onRequestHint }: HintRowProps) {
  const revealedByKind = new Map(hints.map((h) => [h.kind, h.text]));
  const budgetSpent = hints.length >= maxHints;

  return (
    <div className="flex w-full max-w-xs gap-2">
      {KINDS.map((kind) => {
        const revealed = revealedByKind.get(kind);
        const blocked =
          disabled || revealed !== undefined || budgetSpent || (kind === "dir" && !hasGuessed);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onRequestHint(kind)}
            disabled={blocked}
            className="flex-1 rounded-[var(--radius-panel)] border border-line bg-surface-1 px-2 py-2 text-center font-sans text-sm text-text disabled:opacity-40"
          >
            {revealed ?? `${LABELS[kind]} · −15`}
          </button>
        );
      })}
    </div>
  );
}
