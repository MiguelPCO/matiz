import type { Hex } from "./types";

/**
 * Palabra → color, vía la API route server-side (nunca llama a Anthropic
 * directo desde el cliente — ver app/api/word-color/route.ts). Nunca lanza:
 * la UI siempre tiene una salida tipada. Caché en memoria por término
 * normalizado, vive mientras dure la sesión del tab.
 */

export type WordColorResult =
  | { ok: true; hex: Hex; cached: boolean }
  | { ok: false; reason: "network" | "invalid" | "timeout" };

const cache = new Map<string, Hex>();

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

function reasonFrom(body: unknown): "network" | "invalid" | "timeout" {
  const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : null;
  return error === "timeout" || error === "invalid" ? error : "network";
}

export async function wordToColor(word: string): Promise<WordColorResult> {
  const key = normalize(word);
  if (!key) return { ok: false, reason: "invalid" };

  const hit = cache.get(key);
  if (hit) return { ok: true, hex: hit, cached: true };

  let res: Response;
  try {
    res = await fetch("/api/word-color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: key }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) return { ok: false, reason: reasonFrom(data) };

  const hex = typeof data === "object" && data !== null ? (data as { hex?: unknown }).hex : null;
  if (typeof hex !== "string") return { ok: false, reason: "invalid" };

  cache.set(key, hex);
  return { ok: true, hex, cached: false };
}
