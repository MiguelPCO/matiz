import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wordToColor } from "./word-color";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("word-color.wordToColor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("palabra vacía es 'invalid' sin llamar a la red", async () => {
    const result = await wordToColor("   ");
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("respuesta ok con hex válido se resuelve y se cachea (segunda llamada no golpea la red)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { hex: "#e7a34b" }));

    const first = await wordToColor("Ámbar");
    expect(first).toEqual({ ok: true, hex: "#e7a34b", cached: false });

    const second = await wordToColor("ámbar"); // misma clave normalizada
    expect(second).toEqual({ ok: true, hex: "#e7a34b", cached: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetch que lanza (fallo de red) se traduce a reason 'network'", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("failed to fetch"));
    const result = await wordToColor("mar");
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  it("respuesta no-ok con error tipado propaga esa reason", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(504, { error: "timeout" }));
    const result = await wordToColor("brasa");
    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("respuesta ok sin hex utilizable es 'invalid'", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, {}));
    const result = await wordToColor("musgo");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
