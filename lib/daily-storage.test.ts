import { afterEach, describe, expect, it, vi } from "vitest";
import { DAILY_HISTORY_STORAGE_KEY, persistHistory, readHistory, writeHistoryEntry } from "./daily-storage";
import type { DailyHistory } from "./daily";

function fakeWindow(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  };
}

describe("daily-storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readHistory sin window (SSR) devuelve {}", () => {
    expect(readHistory()).toEqual({});
  });

  it("readHistory sin dato guardado devuelve {}", () => {
    vi.stubGlobal("window", fakeWindow());
    expect(readHistory()).toEqual({});
  });

  it("readHistory devuelve lo que persistHistory guardó", () => {
    vi.stubGlobal("window", fakeWindow());
    const history: DailyHistory = {
      "2026-08-29": { guesses: [], hints: [], status: "solved", score: 100 },
    };
    persistHistory(history);
    expect(readHistory()).toEqual(history);
  });

  it("readHistory con JSON corrupto devuelve {} en vez de lanzar", () => {
    vi.stubGlobal("window", fakeWindow({ [DAILY_HISTORY_STORAGE_KEY]: "{not json" }));
    expect(readHistory()).toEqual({});
  });

  it("writeHistoryEntry agrega una entrada sin pisar las demás, y persiste", () => {
    vi.stubGlobal("window", fakeWindow());
    const base: DailyHistory = {
      "2026-08-28": { guesses: [], hints: [], status: "solved", score: 80 },
    };
    const result = writeHistoryEntry(base, "2026-08-29", {
      guesses: [],
      hints: [],
      status: "failed",
      score: 0,
    });
    expect(result).toEqual({
      "2026-08-28": { guesses: [], hints: [], status: "solved", score: 80 },
      "2026-08-29": { guesses: [], hints: [], status: "failed", score: 0 },
    });
    expect(readHistory()).toEqual(result);
  });

  it("persistHistory sin window (SSR) no lanza", () => {
    expect(() => persistHistory({})).not.toThrow();
  });
});
