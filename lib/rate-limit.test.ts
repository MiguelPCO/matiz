import { describe, expect, it, beforeEach } from "vitest";
import { allow, clientKey, resetRateLimit } from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(resetRateLimit);

  it("deja pasar hasta el límite y luego corta", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allow("ip", now)).toBe(true);
    expect(allow("ip", now)).toBe(false);
  });

  it("vuelve a dejar pasar cuando la ventana caduca", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) allow("ip", now);
    expect(allow("ip", now + 59_000)).toBe(false);
    expect(allow("ip", now + 61_000)).toBe(true);
  });

  it("cuenta por separado cada cliente", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) allow("a", now);
    expect(allow("a", now)).toBe(false);
    expect(allow("b", now)).toBe(true);
  });

  it("usa la primera IP de x-forwarded-for", () => {
    const request = new Request("https://matiz.app/api/color-word", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientKey(request)).toBe("1.2.3.4");
  });
});
