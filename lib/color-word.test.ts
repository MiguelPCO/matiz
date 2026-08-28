import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { colorWord } from "./color-word";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("color-word.colorWord", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("respuesta ok con word válida se resuelve", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { word: "óxido" }));
    const result = await colorWord("#b7410e");
    expect(result).toEqual({ ok: true, word: "óxido" });
  });

  it("envía el hex en el body de la petición", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { word: "musgo" }));
    await colorWord("#4a5d23");
    expect(fetch).toHaveBeenCalledWith(
      "/api/color-word",
      expect.objectContaining({ body: JSON.stringify({ hex: "#4a5d23" }) }),
    );
  });

  it("fetch que lanza (fallo de red) se traduce a reason 'network'", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("failed to fetch"));
    const result = await colorWord("#b7410e");
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("respuesta no-ok con error tipado propaga esa reason", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(504, { error: "timeout" }));
    const result = await colorWord("#b7410e");
    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("envía excludeWord en el body cuando se pasa", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { word: "cielo" }));
    await colorWord("#3a6ea5", "azul");
    expect(fetch).toHaveBeenCalledWith(
      "/api/color-word",
      expect.objectContaining({ body: JSON.stringify({ hex: "#3a6ea5", excludeWord: "azul" }) }),
    );
  });

  it("respuesta ok sin word utilizable es 'invalid'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}));
    const result = await colorWord("#b7410e");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
