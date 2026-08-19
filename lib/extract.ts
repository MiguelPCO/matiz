import { linearToSRGB, rgbToHex, sRGBToLinear } from "./color";
import type { Hex } from "./types";

/**
 * Color representativo de una imagen: media en luz lineal (evita el sesgo
 * hacia el gris que da promediar directo en sRGB gamma), ponderada hacia los
 * píxeles más saturados (max-min de canal alto) para que un fondo neutro no
 * ahogue al sujeto. Descarta píxeles casi transparentes. Portado de
 * croma.jsx (`extractColor`).
 */

const SAMPLE_SIZE = 60;
const ALPHA_THRESHOLD = 125;

/** Puro: opera sobre un buffer RGBA plano. Testable sin canvas/DOM. */
export function extractColorFromPixels(data: ArrayLike<number>): Hex {
  let R = 0;
  let G = 0;
  let B = 0;
  let W = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < ALPHA_THRESHOLD) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const weight = 1 + (Math.max(r, g, b) - Math.min(r, g, b)) / 60;
    R += sRGBToLinear(r) * weight;
    G += sRGBToLinear(g) * weight;
    B += sRGBToLinear(b) * weight;
    W += weight;
  }

  if (W === 0) return "#808080";
  return rgbToHex(linearToSRGB(R / W), linearToSRGB(G / W), linearToSRGB(B / W));
}

/** Cliente/DOM: reduce la imagen a una muestra pequeña vía canvas y delega en extractColorFromPixels. */
export function extractColor(imgEl: HTMLImageElement): Hex {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#808080";
  ctx.drawImage(imgEl, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return extractColorFromPixels(data);
}
