/**
 * Lista curada para la pista al azar de Solo. Antes se pedía a Claude que
 * "eligiera una palabra al azar" en cada partida (app/api/random-word) —
 * en la práctica un LLM colapsa hacia un puñado de respuestas "típicas"
 * incluso con temperature alto y un nonce en el prompt, así que tras varias
 * partidas reales solo aparecían 2-3 colores distintos. Una lista fija +
 * Math.random del lado del cliente garantiza variedad real; el hex sigue
 * saliendo de wordToColor (lib/word-color.ts), la misma ruta ya usada
 * cuando el jugador escribe su propia palabra.
 */

export const SOLO_WORDS: readonly string[] = [
  "óxido",
  "musgo",
  "lavanda",
  "mandarina",
  "aceituna",
  "coral",
  "turquesa",
  "canela",
  "berenjena",
  "mostaza",
  "salmón",
  "menta",
  "ciruela",
  "arena",
  "cobalto",
  "grafito",
  "marfil",
  "ámbar",
  "esmeralda",
  "cereza",
  "chocolate",
  "limón",
  "pistacho",
  "vino tinto",
  "cielo despejado",
  "ladrillo",
  "orquídea",
  "azafrán",
  "acero",
  "melocotón",
  "jade",
  "borgoña",
  "girasol",
  "pizarra",
  "café",
  "arándano",
  "granate",
  "hierba fresca",
  "topacio",
  "calabaza",
  "malva",
  "cúrcuma",
  "abeto",
  "terracota",
  "perla",
  "índigo",
  "kiwi",
  "sandía",
  "azufre",
  "caramelo",
  "eucalipto",
  "vainilla",
  "zafiro",
  "algas",
  "rubí",
  "durazno",
  "hollín",
  "papaya",
  "cobre",
  "lila",
  "musgo húmedo",
  "yema de huevo",
] as const;

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

export function pickSoloWord(exclude?: string): string {
  const excluded = exclude ? normalize(exclude) : null;
  const pool = excluded ? SOLO_WORDS.filter((w) => normalize(w) !== excluded) : SOLO_WORDS;
  const idx = Math.floor(Math.random() * pool.length);
  // pool nunca está vacío: SOLO_WORDS tiene >1 entrada y exclude filtra a lo sumo una.
  return pool[idx] as string;
}
