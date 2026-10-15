import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { allow, clientKey } from "../../../lib/rate-limit";
import { CLAUDE_MODEL, claude } from "../../../lib/claude";

/**
 * hex → palabra, la dirección inversa de app/api/word-color/route.ts —
 * para Diario (lib/daily.ts), donde el color del día sale de matemática
 * pura sobre la fecha, sin palabra asociada. Esto le pone una etiqueta
 * legible al color YA generado, no al revés: nunca decide el color.
 *
 * También reutilizada por la pista extra del último tiro en Solo
 * (Play.tsx) — ahí se pasa excludeWord para no repetir la palabra de la
 * pista original.
 */

const TIMEOUT_MS = 15_000;
const HEX_INPUT_PATTERN = /^#[0-9a-fA-F]{6}$/;
const WORD_PATTERN = /^[a-záéíóúñü ]+$/;

type ErrorReason = "network" | "invalid" | "timeout" | "rate_limited";

// El color del día es determinista, así que la misma petición se repite
// mucho entre jugadores: cachear evita pagar dos veces por la misma palabra.
// ponytail: caché por instancia, se pierde en cada arranque en frío.
const CACHE_MAX = 500;
const cache = new Map<string, string>();

function errorResponse(reason: ErrorReason, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

export async function POST(request: Request) {
  if (!allow(clientKey(request))) return errorResponse("rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid", 400);
  }

  const hex =
    typeof body === "object" && body !== null && "hex" in body ? (body as { hex: unknown }).hex : null;

  if (typeof hex !== "string" || !HEX_INPUT_PATTERN.test(hex)) {
    return errorResponse("invalid", 400);
  }

  const excludeWordRaw =
    typeof body === "object" && body !== null && "excludeWord" in body
      ? (body as { excludeWord: unknown }).excludeWord
      : null;
  const excludeWord =
    typeof excludeWordRaw === "string" && excludeWordRaw.trim() ? excludeWordRaw.trim() : null;

  // excludeWord entra en el prompt: sin tope de longitud y sin formato
  // sería una puerta abierta a prompt injection y a prompts enormes.
  if (excludeWord !== null && (excludeWord.length > 40 || !WORD_PATTERN.test(excludeWord.toLowerCase()))) {
    return errorResponse("invalid", 400);
  }

  const cacheKey = `${hex.toLowerCase()}|${excludeWord ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json({ word: cached });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await claude.messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: 256,
        // Sin perilla de determinismo en este modelo/tarea — todos los
        // jugadores viendo la misma palabra el mismo día para el mismo hex
        // depende solo de la caché de useDaily.ts (por dateKey, en
        // localStorage), que evita repetir la llamada en el mismo
        // navegador — no sincroniza entre jugadores por sí sola.
        messages: [
          {
            role: "user",
            content: `Eres experto en color. Para el hex ${hex}, da UNA palabra o concepto cotidiano en español (objeto, fruta, animal, material...) cuyo color real y prototípico sea el más parecido.${excludeWord ? ` Debe ser DISTINTA de "${excludeWord}".` : ""} Responde ÚNICAMENTE con esa palabra, en minúsculas, sin puntuación ni explicación.`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim()
      .toLowerCase();

    if (!text || !WORD_PATTERN.test(text) || text.length > 40) {
      return errorResponse("invalid", 502);
    }

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(cacheKey, text);

    return NextResponse.json({ word: text });
  } catch (err) {
    if (controller.signal.aborted) return errorResponse("timeout", 504);
    if (err instanceof Anthropic.APIError) return errorResponse("network", 502);
    return errorResponse("network", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
