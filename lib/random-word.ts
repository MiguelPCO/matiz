import type { Hex } from "./types";

/**
 * Palabra + color al azar, vía la API route server-side (ver
 * app/api/random-word/route.ts). Nunca lanza: la UI siempre tiene una
 * salida tipada. Sin caché — a diferencia de wordToColor, cada llamada
 * debe poder devolver algo distinto.
 */

export type RandomWordColorResult =
  | { ok: true; word: string; hex: Hex }
  | { ok: false; reason: "network" | "invalid" | "timeout" };

function reasonFrom(body: unknown): "network" | "invalid" | "timeout" {
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
  return error === "timeout" || error === "invalid" ? error : "network";
}

export async function randomWordColor(): Promise<RandomWordColorResult> {
  let res: Response;
  try {
    res = await fetch("/api/random-word", { method: "POST" });
  } catch {
    return { ok: false, reason: "network" };
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) return { ok: false, reason: reasonFrom(data) };

  const word = typeof data === "object" && data !== null ? (data as { word?: unknown }).word : null;
  const hex = typeof data === "object" && data !== null ? (data as { hex?: unknown }).hex : null;
  if (typeof word !== "string" || typeof hex !== "string") return { ok: false, reason: "invalid" };

  return { ok: true, word, hex };
}
