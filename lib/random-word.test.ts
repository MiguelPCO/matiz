import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomWordColor } from "./random-word";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("random-word.randomWordColor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("respuesta ok con word+hex válidos se resuelve", async () => {
    const result = await (async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { word: "óxido", hex: "#b7410e" }));
      return randomWordColor();
    })();
    expect(result).toEqual({ ok: true, word: "óxido", hex: "#b7410e" });
  });

  it("dos llamadas seguidas golpean la red las dos veces — sin caché", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { word: "óxido", hex: "#b7410e" }))
      .mockResolvedValueOnce(jsonResponse(200, { word: "musgo", hex: "#4a5d23" }));

    const first = await randomWordColor();
    const second = await randomWordColor();

    expect(first).toEqual({ ok: true, word: "óxido", hex: "#b7410e" });
    expect(second).toEqual({ ok: true, word: "musgo", hex: "#4a5d23" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("envía excludeWord en el body cuando se pasa", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { word: "musgo", hex: "#4a5d23" }));
    await randomWordColor("óxido");
    expect(fetch).toHaveBeenCalledWith(
      "/api/random-word",
      expect.objectContaining({ body: JSON.stringify({ excludeWord: "óxido" }) }),
    );
  });

  it("fetch que lanza (fallo de red) se traduce a reason 'network'", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("failed to fetch"));
    const result = await randomWordColor();
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("respuesta no-ok con error tipado propaga esa reason", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(504, { error: "timeout" }));
    const result = await randomWordColor();
    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("respuesta ok sin word o sin hex utilizable es 'invalid'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { word: "musgo" }));
    const result = await randomWordColor();
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
