import { describe, expect, it } from "vitest";
import { hexToOklch } from "./color";
import { buildDailyGridSpec, buildShareText, computeDailyStats, localDateKey } from "./daily";
import type { DailyHistory, DailyResult } from "./daily";

describe("daily.localDateKey", () => {
  it("misma fecha local produce la misma clave, sin importar la hora", () => {
    const early = new Date(2026, 7, 23, 0, 0, 1);
    const late = new Date(2026, 7, 23, 23, 59, 59);
    expect(localDateKey(early)).toBe("2026-08-23");
    expect(localDateKey(late)).toBe("2026-08-23");
  });

  it("un día distinto produce una clave distinta", () => {
    expect(localDateKey(new Date(2026, 7, 24, 0, 0, 1))).toBe("2026-08-24");
  });
});

describe("daily.buildDailyGridSpec", () => {
  it("misma fecha produce siempre el mismo GridSpec", () => {
    const date = new Date(2026, 7, 23);
    const a = buildDailyGridSpec(date);
    const b = buildDailyGridSpec(date);
    expect(b).toEqual(a);
  });

  it("config fija: 6x6 / medio para todas las fechas", () => {
    for (let i = 0; i < 30; i++) {
      const spec = buildDailyGridSpec(new Date(2026, 0, i + 1));
      expect(spec.size).toBe(6);
      expect(spec.difficulty).toBe("medio");
    }
  });

  it("targetHex cae dentro del rango curado L∈[0.4,0.72]/C∈[0.06,0.16] (margen 0.01 por redondeo de 8 bits)", () => {
    const MARGIN = 0.01;
    for (let i = 0; i < 30; i++) {
      const spec = buildDailyGridSpec(new Date(2026, 0, i + 1));
      const { L, C } = hexToOklch(spec.targetHex);
      expect(L).toBeGreaterThanOrEqual(0.4 - MARGIN);
      expect(L).toBeLessThanOrEqual(0.72 + MARGIN);
      expect(C).toBeGreaterThanOrEqual(0.06 - MARGIN);
      expect(C).toBeLessThanOrEqual(0.16 + MARGIN);
    }
  });

  it("fechas distintas producen targetHex distinto en la gran mayoría de pares (colisión por azar acotada)", () => {
    const hexes = new Set<string>();
    const N = 60;
    for (let i = 0; i < N; i++) {
      hexes.add(buildDailyGridSpec(new Date(2026, 0, i + 1)).targetHex);
    }
    expect(hexes.size).toBeGreaterThanOrEqual(N - 2);
  });
});

function win(score = 100): DailyResult {
  return { guesses: [], hints: [], status: "solved", score };
}

function loss(score = 0): DailyResult {
  return { guesses: [], hints: [], status: "failed", score };
}

describe("daily.computeDailyStats", () => {
  it("historial vacío: todo en cero", () => {
    expect(computeDailyStats({}, "2026-08-23")).toEqual({
      gamesPlayed: 0,
      wins: 0,
      winPercent: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  });

  it("cuenta partidas/victorias/% correctamente", () => {
    const history: DailyHistory = {
      "2026-08-20": win(),
      "2026-08-21": loss(),
      "2026-08-22": win(),
    };
    const stats = computeDailyStats(history, "2026-08-22");
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.winPercent).toBe(67); // round(2/3*100)
  });

  it("racha actual: días consecutivos ganados terminando hoy", () => {
    const history: DailyHistory = {
      "2026-08-20": win(),
      "2026-08-21": win(),
      "2026-08-22": win(),
    };
    expect(computeDailyStats(history, "2026-08-22").currentStreak).toBe(3);
  });

  it("racha actual: fallar hoy la corta a 0 de inmediato aunque ayer se ganara", () => {
    const history: DailyHistory = {
      "2026-08-21": win(),
      "2026-08-22": loss(),
    };
    expect(computeDailyStats(history, "2026-08-22").currentStreak).toBe(0);
  });

  it("racha actual: no haber jugado hoy todavía no la corta, sigue contando desde ayer", () => {
    const history: DailyHistory = {
      "2026-08-20": win(),
      "2026-08-21": win(),
      // sin entrada para "2026-08-22" — hoy, aún sin jugar
    };
    expect(computeDailyStats(history, "2026-08-22").currentStreak).toBe(2);
  });

  it("racha actual: un hueco en el pasado la corta ahí", () => {
    const history: DailyHistory = {
      "2026-08-18": win(),
      // hueco en 08-19 (no jugado)
      "2026-08-20": win(),
      "2026-08-21": win(),
      "2026-08-22": win(),
    };
    expect(computeDailyStats(history, "2026-08-22").currentStreak).toBe(3);
  });

  it("mejor racha: puede ser mayor que la actual si hubo una racha histórica más larga", () => {
    const history: DailyHistory = {
      "2026-08-10": win(),
      "2026-08-11": win(),
      "2026-08-12": win(),
      "2026-08-13": win(),
      // hueco
      "2026-08-20": win(),
      "2026-08-21": loss(),
      "2026-08-22": win(),
    };
    const stats = computeDailyStats(history, "2026-08-22");
    expect(stats.bestStreak).toBe(4);
    expect(stats.currentStreak).toBe(1);
  });
});

describe("daily.buildShareText", () => {
  it("formato exacto estilo Wordle para un DailyResult de muestra", () => {
    const text = buildShareText("2026-08-23", {
      guesses: [
        { row: 1, col: 1, hex: "#aabbcc", ring: 2, closeness: 0.4 },
        { row: 2, col: 2, hex: "#bbccdd", ring: 3, closeness: 0.2 },
        { row: 3, col: 3, hex: "#ccddee", ring: 4, closeness: 0.1 },
      ],
      hints: [{ kind: "light", text: "Claro" }],
      status: "failed",
      score: 42,
    });
    expect(text).toBe("MATIZ 2026-08-23\n🟧⬜⬜\n42 pts, 1 pista");
  });
});
