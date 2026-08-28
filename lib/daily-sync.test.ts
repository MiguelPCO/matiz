import { describe, expect, it } from "vitest";
import { dailyHistoryToRows, entriesToUpload, mergeDailyHistory, rowsToDailyHistory } from "./daily-sync";
import type { DailyHistory, DailyResult } from "./daily";

function win(score = 100): DailyResult {
  return { guesses: [], hints: [], status: "solved", score };
}

function loss(score = 0): DailyResult {
  return { guesses: [], hints: [], status: "failed", score };
}

describe("daily-sync.mergeDailyHistory", () => {
  it("fechas que solo existen en local se incluyen tal cual", () => {
    const local: DailyHistory = { "2026-08-20": win() };
    const remote: DailyHistory = {};
    expect(mergeDailyHistory(local, remote)).toEqual({ "2026-08-20": win() });
  });

  it("fechas que solo existen en remote se incluyen tal cual", () => {
    const local: DailyHistory = {};
    const remote: DailyHistory = { "2026-08-20": win() };
    expect(mergeDailyHistory(local, remote)).toEqual({ "2026-08-20": win() });
  });

  it("misma fecha en ambos: remote gana", () => {
    const local: DailyHistory = { "2026-08-20": win(50) };
    const remote: DailyHistory = { "2026-08-20": win(999) };
    expect(mergeDailyHistory(local, remote)).toEqual({ "2026-08-20": win(999) });
  });

  it("historiales disjuntos se combinan completos", () => {
    const local: DailyHistory = { "2026-08-20": win() };
    const remote: DailyHistory = { "2026-08-21": loss() };
    expect(mergeDailyHistory(local, remote)).toEqual({
      "2026-08-20": win(),
      "2026-08-21": loss(),
    });
  });
});

describe("daily-sync.entriesToUpload", () => {
  it("fechas en local ausentes en remote se marcan para subir", () => {
    const local: DailyHistory = { "2026-08-20": win(), "2026-08-21": loss() };
    const remote: DailyHistory = { "2026-08-20": win() };
    expect(entriesToUpload(local, remote)).toEqual({ "2026-08-21": loss() });
  });

  it("todo ya sincronizado: nada que subir", () => {
    const local: DailyHistory = { "2026-08-20": win() };
    const remote: DailyHistory = { "2026-08-20": win() };
    expect(entriesToUpload(local, remote)).toEqual({});
  });

  it("local vacío: nada que subir", () => {
    expect(entriesToUpload({}, { "2026-08-20": win() })).toEqual({});
  });

  it("remote vacío: todo el local se sube", () => {
    const local: DailyHistory = { "2026-08-20": win(), "2026-08-21": loss() };
    expect(entriesToUpload(local, {})).toEqual(local);
  });
});

describe("daily-sync.rowsToDailyHistory / dailyHistoryToRows", () => {
  it("filas remotas se convierten a historial indexado por date_key", () => {
    expect(
      rowsToDailyHistory([
        { date_key: "2026-08-20", status: "solved", score: 100, guesses: [], hints: [] },
        { date_key: "2026-08-21", status: "failed", score: 0, guesses: [], hints: [] },
      ]),
    ).toEqual({ "2026-08-20": win(), "2026-08-21": loss() });
  });

  it("sin filas: historial vacío", () => {
    expect(rowsToDailyHistory([])).toEqual({});
  });

  it("cada fila a insertar lleva el user_id del usuario en sesión", () => {
    const history: DailyHistory = { "2026-08-20": win(42) };
    expect(dailyHistoryToRows("user-1", history)).toEqual([
      { user_id: "user-1", date_key: "2026-08-20", status: "solved", score: 42, guesses: [], hints: [] },
    ]);
  });

  it("ida y vuelta: rowsToDailyHistory(dailyHistoryToRows(...)) devuelve el historial original", () => {
    const history: DailyHistory = { "2026-08-20": win(70), "2026-08-21": loss(), "2026-08-22": win() };
    expect(rowsToDailyHistory(dailyHistoryToRows("user-1", history))).toEqual(history);
  });
});
