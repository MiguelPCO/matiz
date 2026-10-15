import Anthropic from "@anthropic-ai/sdk";

// Único dueño del cliente y el modelo de las rutas app/api/* (lint lo exige).
export const claude = new Anthropic();
export const CLAUDE_MODEL = "claude-haiku-4-5";
