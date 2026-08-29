import type { DailyHistory, DailyResult } from "./daily";

/**
 * I/O puro de localStorage para el historial de Diario — extraído de
 * hooks/useDaily.ts (ver docs/superpowers/specs/2026-08-29-profile-screen-design.md)
 * para que la pantalla de Perfil pueda leer el historial sin montar el hook
 * completo (que dispara fetch de palabra-pista y sync remoto).
 */

export const DAILY_HISTORY_STORAGE_KEY = "matiz-daily-history-v1";

export function readHistory(): DailyHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAILY_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DailyHistory;
  } catch {
    return {};
  }
}

export function persistHistory(history: DailyHistory): DailyHistory {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
  return history;
}

export function writeHistoryEntry(base: DailyHistory, dateKey: string, result: DailyResult): DailyHistory {
  return persistHistory({ ...base, [dateKey]: result });
}
