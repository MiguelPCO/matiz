import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

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

const client = new Anthropic();
const TIMEOUT_MS = 15_000;
const HEX_INPUT_PATTERN = /^#[0-9a-fA-F]{6}$/;
const WORD_PATTERN = /^[a-záéíóúñü ]+$/;

type ErrorReason = "network" | "invalid" | "timeout";

function errorResponse(reason: ErrorReason, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

export async function POST(request: Request) {
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: "claude-opus-5",
        max_tokens: 16000,
        // temperature 0 — a diferencia de random-word (que SÍ quiere variar
        // entre llamadas), aquí todos los jugadores deben ver la misma
        // palabra el mismo día para el mismo hex. Best-effort: la API no
        // garantiza determinismo exacto ni con temperature 0, pero reduce
        // la varianza frente al default. La caché de useDaily.ts (por
        // dateKey, en localStorage) solo evita repetir la llamada en el
        // mismo navegador — no sincroniza entre jugadores por sí sola.
        temperature: 0,
        output_config: { effort: "low" },
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

    return NextResponse.json({ word: text });
  } catch (err) {
    if (controller.signal.aborted) return errorResponse("timeout", 504);
    if (err instanceof Anthropic.APIError) return errorResponse("network", 502);
    return errorResponse("network", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
