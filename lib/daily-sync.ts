import type { DailyHistory } from "./daily";

/**
 * Lógica pura de fusión entre historial local (localStorage) y remoto
 * (Supabase) — ver docs/superpowers/specs/2026-08-28-diario-account-sync-design.md.
 * Sin cliente Supabase aquí: hooks/useDaily.ts hace el fetch/insert y le
 * pasa los dos DailyHistory ya resueltos.
 */

/**
 * Fusiona historial local + remoto: el remoto gana si ambos tienen la misma
 * fecha (ya sincronizado desde otro dispositivo, la fila remota es la
 * autoritativa); las fechas que solo existen en uno de los dos se incluyen
 * tal cual.
 */
export function mergeDailyHistory(local: DailyHistory, remote: DailyHistory): DailyHistory {
  return { ...local, ...remote };
}

/**
 * De un historial local + uno remoto, qué entradas locales hay que subir
 * (existen en local pero no en remote) — usado para la migración al iniciar
 * sesión por primera vez y como reconciliación general en cada mount con
 * sesión activa.
 */
export function entriesToUpload(local: DailyHistory, remote: DailyHistory): DailyHistory {
  const result: Record<string, DailyHistory[string]> = {};
  for (const [dateKey, entry] of Object.entries(local)) {
    if (!(dateKey in remote)) result[dateKey] = entry;
  }
  return result;
}
