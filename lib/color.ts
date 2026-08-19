import type { Hex, Oklab, Oklch } from "./types";

/**
 * sRGB <-> OKLab <-> OKLCH (Björn Ottosson).
 * OKLCH es el formato canónico del proyecto; los hex son solo referencia.
 * Puro: sin React, sin DOM, sin aleatoriedad.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function sRGBToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSRGB(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

export function hexToRgb(hex: Hex): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): Hex {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = sRGBToLinear(r);
  const lg = sRGBToLinear(g);
  const lb = sRGBToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

/** Sin clamp ni redondeo — puede salirse de [0,1] si el color no cabe en sRGB. */
function oklabToLinearRgb(L: number, a: number, b: number): LinearRgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Gamma-codifica sin redondear ni recortar — deja ver si el canal se sale de [0,1]. */
function linearToGamma(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
}

const GAMUT_EPSILON = 1e-4;

function isInGamut(L: number, a: number, b: number): boolean {
  const linear = oklabToLinearRgb(L, a, b);
  return [linear.r, linear.g, linear.b].every(
    (c) => linearToGamma(c) >= -GAMUT_EPSILON && linearToGamma(c) <= 1 + GAMUT_EPSILON,
  );
}

export function oklabToRgb(L: number, a: number, b: number): Rgb {
  const linear = oklabToLinearRgb(L, a, b);
  return {
    r: linearToSRGB(linear.r),
    g: linearToSRGB(linear.g),
    b: linearToSRGB(linear.b),
  };
}

export function oklabToOklch(lab: Oklab): Oklch {
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C: Math.hypot(lab.a, lab.b), H };
}

function oklchToOklab(c: Oklch): Oklab {
  const h = (c.H * Math.PI) / 180;
  return { L: c.L, a: c.C * Math.cos(h), b: c.C * Math.sin(h) };
}

/**
 * Máximo croma representable en sRGB para un L y H dados, sin superar
 * upperBound. El gamut es monótono en C a L/H fijos (no hay huecos), así que
 * la búsqueda binaria converge al borde exacto.
 */
export function maxInGamutChroma(L: number, H: number, upperBound: number): number {
  const atUpperBound = oklchToOklab({ L, C: upperBound, H });
  if (isInGamut(atUpperBound.L, atUpperBound.a, atUpperBound.b)) {
    return upperBound;
  }
  let lo = 0;
  let hi = upperBound;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const candidate = oklchToOklab({ L, C: mid, H });
    if (isInGamut(candidate.L, candidate.a, candidate.b)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Reduce el croma manteniendo L y H fijos hasta caer dentro del gamut sRGB.
 * Evita el recorte silencioso por canal de linearToSRGB, que distorsiona L
 * y H además de C — precisamente lo que rompe la decidibilidad de la carta.
 */
function toInGamutOklab(c: Oklch): Oklab {
  const lab = oklchToOklab(c);
  if (isInGamut(lab.L, lab.a, lab.b)) return lab;
  const maxC = maxInGamutChroma(c.L, c.H, c.C);
  return oklchToOklab({ L: c.L, C: maxC, H: c.H });
}

export function oklchToHex(c: Oklch): Hex {
  const lab = toInGamutOklab(c);
  const rgb = oklabToRgb(lab.L, lab.a, lab.b);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function hexToOklch(hex: Hex): Oklch {
  const { r, g, b } = hexToRgb(hex);
  return oklabToOklch(rgbToOklab(r, g, b));
}

function hexToOklab(hex: Hex): Oklab {
  const { r, g, b } = hexToRgb(hex);
  return rgbToOklab(r, g, b);
}

/** Distancia euclídea en OKLab. Base del termómetro. */
export function deltaE(a: Hex, b: Hex): number {
  const oa = hexToOklab(a);
  const ob = hexToOklab(b);
  return Math.hypot(oa.L - ob.L, oa.a - ob.a, oa.b - ob.b);
}
