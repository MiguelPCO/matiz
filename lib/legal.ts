// Datos del titular para /privacidad y /aviso-legal. Nombre, NIF, domicilio y email
// vienen de env (.env.local / Vercel) para no dejarlos en el repo público.
const missing = "[pendiente]";

export const LEGAL = {
  owner: process.env.LEGAL_OWNER ?? missing,
  nif: process.env.LEGAL_NIF ?? missing,
  address: process.env.LEGAL_ADDRESS ?? missing,
  email: process.env.LEGAL_EMAIL ?? missing,
  updatedAt: "18 de septiembre de 2026",
} as const;
