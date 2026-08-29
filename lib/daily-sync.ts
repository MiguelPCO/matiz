import type { DailyHistory, DailyResult } from "./daily";

/**
 * Lógica pura de fusión entre historial local (localStorage) y remoto
 * (Supabase) — ver docs/superpowers/specs/2026-08-28-diario-account-sync-design.md.
 * Sin cliente Supabase aquí: hooks/useDaily.ts hace el fetch/insert y le
 * pasa los dos DailyHistory ya resueltos. La conversión fila↔historial
 * también vive aquí (y no inline en el hook) para que sea testeable sin
 * infraestructura Supabase real.
 */

/**
 * Forma de una fila de la tabla `daily_results` tal y como la lee/escribe
 * hooks/useDaily.ts — snake_case, igual que supabase/schema.sql. `user_id`
 * no forma parte del select (se filtra por él), pero sí de los inserts, así
 * que lo aporta dailyHistoryToRows().
 */
export interface DailyResultRow {
  readonly date_key: string;
  readonly status: "solved" | "failed";
  readonly score: number;
  readonly guesses: DailyResult["guesses"];
  readonly hints: DailyResult["hints"];
}

export interface DailyResultInsertRow extends DailyResultRow {
  readonly user_id: string;
}

/** Filas de Supabase → DailyHistory (clave = date_key). */
export function rowsToDailyHistory(rows: readonly DailyResultRow[]): DailyHistory {
  const history: Record<string, DailyResult> = {};
  for (const row of rows) {
    history[row.date_key] = {
      status: row.status,
      score: row.score,
      guesses: row.guesses,
      hints: row.hints,
    };
  }
  return history;
}

/** DailyHistory → filas listas para insertar en `daily_results`. */
export function dailyHistoryToRows(userId: string, history: DailyHistory): DailyResultInsertRow[] {
  return Object.entries(history).map(([dateKey, result]) => ({
    user_id: userId,
    date_key: dateKey,
    status: result.status,
    score: result.score,
    guesses: result.guesses,
    hints: result.hints,
  }));
}

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
