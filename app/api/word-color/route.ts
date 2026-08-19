import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * Palabra → hex vía Claude. Server-side: la API key nunca llega al cliente
 * (el prototipo croma.jsx llamaba a api.anthropic.com directo desde el
 * navegador sin auth, lo cual solo funcionaba porque nunca se desplegó).
 */

const client = new Anthropic();
const TIMEOUT_MS = 15_000;
const MAX_WORD_LENGTH = 60;
const HEX_PATTERN = /#([0-9a-fA-F]{6})/;

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

  const word =
    typeof body === "object" && body !== null && "word" in body
      ? (body as { word: unknown }).word
      : null;

  if (typeof word !== "string" || word.trim().length === 0 || word.length > MAX_WORD_LENGTH) {
    return errorResponse("invalid", 400);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: "claude-opus-5",
        max_tokens: 16000,
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: `Eres experto en color. Para el concepto "${word.trim()}", da el color más prototípico y reconocible: el del objeto o material real, el que la mayoría imaginaría (p. ej. "helado de vainilla" = crema, "óxido" = herrumbre). Responde ÚNICAMENTE con un hex #rrggbb, nada más.`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const match = HEX_PATTERN.exec(text);
    const captured = match?.[1];
    if (!captured) return errorResponse("invalid", 502);

    return NextResponse.json({ hex: `#${captured.toLowerCase()}` });
  } catch (err) {
    if (controller.signal.aborted) return errorResponse("timeout", 504);
    if (err instanceof Anthropic.APIError) return errorResponse("network", 502);
    return errorResponse("network", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
