import { describe, expect, it } from "vitest";
import { extractColorFromPixels } from "./extract";

function solidRgba(r: number, g: number, b: number, a: number, count: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < count; i++) data.push(r, g, b, a);
  return data;
}

describe("extract.extractColorFromPixels", () => {
  it("un color sólido opaco sobrevive el roundtrip lineal casi exacto", () => {
    const data = solidRgba(220, 40, 40, 255, 16);
    expect(extractColorFromPixels(data)).toBe("#dc2828");
  });

  it("descarta píxeles por debajo del umbral de alpha", () => {
    const data = [
      ...solidRgba(220, 40, 40, 255, 4), // opaco, cuenta
      ...solidRgba(20, 20, 220, 10, 4), // casi transparente, se ignora
    ];
    expect(extractColorFromPixels(data)).toBe(extractColorFromPixels(solidRgba(220, 40, 40, 255, 4)));
  });

  it("imagen completamente transparente cae al gris neutro de reserva", () => {
    const data = solidRgba(10, 200, 30, 0, 8);
    expect(extractColorFromPixels(data)).toBe("#808080");
  });

  it("pondera hacia los píxeles más saturados frente a un fondo neutro", () => {
    const data = [
      ...solidRgba(128, 128, 128, 255, 20), // fondo neutro, sin saturación
      ...solidRgba(255, 0, 0, 255, 4), // sujeto saturado, minoría de píxeles
    ];
    const plainAverage = extractColorFromPixels(solidRgba(128, 128, 128, 255, 1)); // #808080
    const weighted = extractColorFromPixels(data);
    expect(weighted).not.toBe(plainAverage);
    // El canal rojo debe subir por encima del gris plano gracias al peso extra.
    const rWeighted = parseInt(weighted.slice(1, 3), 16);
    expect(rWeighted).toBeGreaterThan(128);
  });
});
