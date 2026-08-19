import { describe, expect, it } from "vitest";
import { hexToOklch, hexToRgb, oklchToHex } from "./color";

function sampleHexes(): string[] {
  const hexes: string[] = [];
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 51) {
      for (let b = 0; b <= 255; b += 51) {
        hexes.push(
          `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
        );
      }
    }
  }
  return hexes;
}

describe("color.roundtrip", () => {
  it("hex -> oklch -> hex es estable en toda la rampa", () => {
    for (const hex of sampleHexes()) {
      const rgb = hexToRgb(hex);
      const roundTripped = oklchToHex(hexToOklch(hex));
      const rt = hexToRgb(roundTripped);

      expect(Math.abs(rt.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(rt.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(rt.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it("es idempotente en una segunda vuelta", () => {
    for (const hex of ["#14161a", "#e7a34b", "#ecf0f1", "#292c31"]) {
      const once = oklchToHex(hexToOklch(hex));
      const twice = oklchToHex(hexToOklch(once));
      expect(twice).toBe(once);
    }
  });
});
