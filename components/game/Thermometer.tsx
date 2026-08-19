"use client";

import { readThermo } from "../../lib/thermo";

interface ThermometerProps {
  readonly closeness: number | null;
}

/** Feedback de proximidad: solo magnitud, nunca dirección (PRD §4.4, regla innegociable). */
export function Thermometer({ closeness }: ThermometerProps) {
  if (closeness === null) {
    return <p className="font-sans text-sm text-text-muted">Toca el matiz que creas correcto.</p>;
  }

  const { label, pct } = readThermo(closeness);

  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-signal transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
        {label}
      </p>
    </div>
  );
}
