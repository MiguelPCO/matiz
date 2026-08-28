import type { Hex } from "./types";

/**
 * hex → palabra, vía la API route server-side (ver app/api/color-word/route.ts).
 * Nunca lanza: la UI siempre tiene una salida tipada. Sin caché en memoria —
 * el llamador (hooks/useDaily.ts) cachea por fecha en localStorage, no por hex.
 */

export type ColorWordResult =
  | { ok: true; word: string }
  | { ok: false; reason: "network" | "invalid" | "timeout" };

function reasonFrom(body: unknown): "network" | "invalid" | "timeout" {
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
  return error === "timeout" || error === "invalid" ? error : "network";
}

export async function colorWord(hex: Hex, excludeWord?: string): Promise<ColorWordResult> {
  let res: Response;
  try {
    res = await fetch("/api/color-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hex, excludeWord }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) return { ok: false, reason: reasonFrom(data) };

  const word = typeof data === "object" && data !== null ? (data as { word?: unknown }).word : null;
  if (typeof word !== "string") return { ok: false, reason: "invalid" };

  return { ok: true, word };
}
