import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * Palabra al azar + su hex, en una sola llamada — para Solo, donde el
 * propio jugador no elige la pista (ver app/api/word-color/route.ts para
 * el caso donde sí la elige). Mismo patrón server-side: la API key nunca
 * llega al cliente. temperature alto + nonce en el prompt para variar
 * entre llamadas — sin ellos Claude tiende a repetir las mismas palabras
 * "típicas" (rosa, oro, cielo) una y otra vez.
 */

const client = new Anthropic();
const TIMEOUT_MS = 15_000;
const RESPONSE_PATTERN = /"word"\s*:\s*"([^"]+)"[\s\S]*?"hex"\s*:\s*"#([0-9a-fA-F]{6})"/;

type ErrorReason = "network" | "invalid" | "timeout";

function errorResponse(reason: ErrorReason, status: number) {
  return NextResponse.json({ error: reason }, { status });
}

export async function POST() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const nonce = Math.floor(Math.random() * 1_000_000);

  try {
    const response = await client.messages.create(
      {
        model: "claude-opus-5",
        max_tokens: 16000,
        temperature: 1,
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: `Elige al azar UN concepto cotidiano en español fuertemente asociado a un color reconocible (objeto, fruta, flor, material, animal...): el color del objeto o material real, el más prototípico. Que sea distinto cada vez que te lo pidan (semilla de variación: ${nonce}) — evita repetir los ejemplos más obvios de tu primera ocurrencia. Responde ÚNICAMENTE con JSON: {"word": "...", "hex": "#rrggbb"}.`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const match = RESPONSE_PATTERN.exec(text);
    const word = match?.[1];
    const hex = match?.[2];
    if (!word || !hex) return errorResponse("invalid", 502);

    return NextResponse.json({ word, hex: `#${hex.toLowerCase()}` });
  } catch (err) {
    if (controller.signal.aborted) return errorResponse("timeout", 504);
    if (err instanceof Anthropic.APIError) return errorResponse("network", 502);
    return errorResponse("network", 502);
  } finally {
    clearTimeout(timeoutId);
  }
}
