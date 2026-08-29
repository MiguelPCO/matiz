import { describe, expect, it, vi } from "vitest";
import { SOLO_WORDS, pickSoloWord } from "./solo-words";

describe("solo-words.pickSoloWord", () => {
  it("siempre devuelve una palabra de la lista curada", () => {
    for (let i = 0; i < 20; i++) {
      expect(SOLO_WORDS).toContain(pickSoloWord());
    }
  });

  it("nunca repite la palabra excluida", () => {
    for (const excluded of SOLO_WORDS) {
      for (let i = 0; i < 5; i++) {
        expect(pickSoloWord(excluded)).not.toBe(excluded);
      }
    }
  });

  it("exclusión es insensible a mayúsculas y espacios", () => {
    const excluded: string = SOLO_WORDS[0] as string;
    for (let i = 0; i < 10; i++) {
      expect(pickSoloWord(` ${excluded.toUpperCase()} `)).not.toBe(excluded);
    }
  });

  it("con Math.random forzado a 0, elige el primer elemento del pool filtrado", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickSoloWord()).toBe(SOLO_WORDS[0]);
    spy.mockRestore();
  });

  it("la lista curada no tiene duplicados", () => {
    const normalized = SOLO_WORDS.map((w) => w.trim().toLowerCase());
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("la lista curada tiene suficiente variedad (>= 40 palabras)", () => {
    expect(SOLO_WORDS.length).toBeGreaterThanOrEqual(40);
  });
});
