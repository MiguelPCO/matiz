"use client";

import type { Clue } from "../../lib/types";

interface ClueBarProps {
  readonly clue: Clue;
}

/** Pista en B/N o palabra. La foto solo se revela a color en S4 (PRD §7.2). */
export function ClueBar({ clue }: ClueBarProps) {
  return (
    <div className="w-full max-w-xs rounded-[var(--radius-panel)] bg-surface-1 p-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
        Pista
      </span>
      {clue.type === "word" ? (
        <p className="mt-1 font-sans text-xl text-text">{clue.word}</p>
      ) : (
        // data URL sin beneficio de next/image; grayscale es intencional durante S3.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clue.imageSrc}
          alt="Pista visual"
          className="mt-2 h-24 w-full rounded-[var(--radius-swatch)] object-cover grayscale"
        />
      )}
    </div>
  );
}
