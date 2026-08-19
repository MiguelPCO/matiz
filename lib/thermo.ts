/**
 * Termómetro: cercanía perceptual (closeness, 0–1) → magnitud legible.
 * Nunca comunica dirección — regla de diseño innegociable (PRD §4.4).
 */

export interface ThermoReading {
  readonly label: "Lejos" | "Templado" | "Cerca" | "Casi" | "¡Ahí es!";
  readonly pct: number; // 0–100, ancho de la barra
}

/** Umbrales validados en el prototipo (croma.jsx). */
export function readThermo(closeness: number): ThermoReading {
  if (closeness >= 0.965) return { label: "¡Ahí es!", pct: 100 };
  if (closeness >= 0.82) return { label: "Casi", pct: 90 };
  if (closeness >= 0.55) return { label: "Cerca", pct: 72 };
  if (closeness >= 0.3) return { label: "Templado", pct: 46 };
  return { label: "Lejos", pct: Math.max(10, closeness * 45) };
}
