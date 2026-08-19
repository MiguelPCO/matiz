"use client";

import type { ReactNode } from "react";

interface LabelProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** Micro-label de instrumento (PRD §5.3): mono, 10px, tracking 0.25em, mayúsculas. */
export function Label({ children, className = "" }: LabelProps) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint ${className}`}
    >
      {children}
    </span>
  );
}
