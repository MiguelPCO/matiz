"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Dispatch } from "react";
import { colorWord } from "../lib/color-word";
import { deltaE } from "../lib/color";
import { buildDailyGridSpec, localDateKey } from "../lib/daily";
import { dailyHistoryToRows, entriesToUpload, mergeDailyHistory, rowsToDailyHistory } from "../lib/daily-sync";
import { scoreRound } from "../lib/engine";
import { buildGrid } from "../lib/grid";
import { createBrowserSupabaseClient } from "../lib/supabase";
import { DIFFICULTY, MAX_GUESSES } from "../lib/types";
import { useSupabaseAuth } from "./useSupabaseAuth";
import type { DailyHistory, DailyResult } from "../lib/daily";
import type { DailyResultRow } from "../lib/daily-sync";
import type { GridSpec, HintKind, Round } from "../lib/types";

/**
 * Estado propio de Diario — useReducer aparte de useGame/lib/engine.ts (ver
 * docs/superpowers/specs/2026-08-23-modo-diario-design.md § Decisión de
 * arquitectura). GUESS/REQUEST_HINT mirroran applyGuess/applyHint de
 * lib/engine.ts línea por línea (esas dos no están exportadas y están
 * atadas a la forma de GameState) — un cambio futuro en las fórmulas de
 * puntuación/pista debe tocar los dos sitios. bestGuess/scoreRound/
 * scoreBreakdown SÍ se reutilizan directamente: ya operan solo sobre Round.
 */

const PLACEHOLDER_PLAYER_ID = "daily-player";
const DAILY_STORAGE_KEY = "matiz-daily-v1";
const DAILY_HISTORY_STORAGE_KEY = "matiz-daily-history-v1";
const DAILY_WORD_STORAGE_KEY = "matiz-daily-word-v1";
const DAILY_SYNCED_USER_KEY = "matiz-daily-synced-user-v1";

interface DailyStorage {
  readonly date: string;
  readonly result: DailyResult;
}

// Legado — antes de las estadísticas (racha/calendario), solo se guardaba
// el resultado del ÚLTIMO día jugado, sobrescrito cada vez. Reemplazado por
// DAILY_HISTORY_STORAGE_KEY (un resultado por fecha). Se sigue leyendo una
// vez, solo para migrar el día de hoy si ya se jugó bajo el esquema viejo
// (ver el efecto de hidratación) — nunca se vuelve a escribir.
function readLegacyCache(dateKey: string): DailyResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DAILY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyStorage;
    if (parsed.date !== dateKey) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function readHistory(): DailyHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAILY_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DailyHistory;
  } catch {
    return {};
  }
}

function persistHistory(history: DailyHistory): DailyHistory {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DAILY_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
  return history;
}

function writeHistoryEntry(base: DailyHistory, dateKey: string, result: DailyResult): DailyHistory {
  return persistHistory({ ...base, [dateKey]: result });
}

interface DailyWordStorage {
  readonly date: string;
  readonly word: string;
}

// Tope explícito de filas del select remoto. PostgREST corta las respuestas
// en 1000 filas por defecto y NO avisa — sin este limit, un jugador de más
// de ~2,7 años vería su historial remoto truncado en silencio y para
// siempre. 3660 ≈ 10 años de partidas diarias: holgado, pero acotado (no
// hay paginación, deliberadamente fuera de alcance).
const REMOTE_HISTORY_ROW_LIMIT = 3660;

// Palabra-pista del día: solo etiqueta el color YA generado por
// buildDailyGridSpec (lib/daily.ts sigue siendo puramente determinista por
// fecha, sin dependencia de red para JUGAR) — se pide una vez por fecha vía
// IA inversa (lib/color-word.ts) y se cachea aparte de DailyStorage, que
// guarda el resultado de la partida, no la pista. Si falla, la pista
// simplemente no aparece — no bloquea nada (ver useDaily más abajo).
function readWordCache(dateKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DAILY_WORD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyWordStorage;
    if (parsed.date !== dateKey) return null;
    return parsed.word;
  } catch {
    return null;
  }
}

function writeWordCache(dateKey: string, word: string): void {
  if (typeof window === "undefined") return;
  const payload: DailyWordStorage = { date: dateKey, word };
  window.localStorage.setItem(DAILY_WORD_STORAGE_KEY, JSON.stringify(payload));
}

// userId cuyo historial remoto fue el último en fusionarse — persistido (no
// un ref en memoria) porque signInWithGoogle hace una redirección de página
// completa (Diario → consentimiento de Google → /auth/callback → /diario):
// eso desmonta y remonta todo el árbol de React, así que un ref se reinicia
// a null justo en el momento en que necesitamos recordar la cuenta anterior.
// Ver el guard anti-contaminación en el efecto de fusión más abajo.
function readSyncedUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DAILY_SYNCED_USER_KEY);
  } catch {
    return null;
  }
}

function writeSyncedUserId(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_SYNCED_USER_KEY, userId);
  } catch {
    // localStorage no disponible — el guard degrada a "no se puede
    // verificar cambio de cuenta", mismo caso que primera sincronización.
  }
}

export type DailyPhase = "loading" | "playing" | "result";

export interface DailyState {
  readonly phase: DailyPhase;
  readonly gridSpec: GridSpec | null;
  readonly round: Round | null;
  readonly dateKey: string;
}

export type DailyAction =
  | { type: "HYDRATE"; cached: DailyResult | null; gridSpec: GridSpec; dateKey: string }
  | { type: "GUESS"; row: number; col: number }
  | { type: "REQUEST_HINT"; kind: HintKind }
  | { type: "SET_CLUE_WORD"; word: string };

const initialDailyState: DailyState = { phase: "loading", gridSpec: null, round: null, dateKey: "" };

function chebyshev(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

// Espejo de applyGuess en lib/engine.ts — ver comentario de cabecera.
function applyDailyGuess(round: Round, gridSpec: GridSpec, row: number, col: number): Round {
  if (round.status !== "playing") return round;
  if (round.guesses.some((g) => g.row === row && g.col === col)) return round;

  const grid = buildGrid(gridSpec);
  const cell = grid.cells[row]?.[col];
  if (!cell) return round;

  const ring = chebyshev({ row, col }, grid.target);
  const closeness = Math.max(
    0,
    Math.min(1, 1 - deltaE(cell.hex, round.clue.targetHex) / grid.maxDeltaE),
  );
  const guesses = [...round.guesses, { row, col, hex: cell.hex, ring, closeness }];
  const over = ring === 0 || guesses.length >= MAX_GUESSES;
  const status: Round["status"] = over ? (ring === 0 ? "solved" : "failed") : "playing";

  return {
    ...round,
    guesses,
    status,
    score: over ? scoreRound({ ...round, guesses, status, score: null }) : null,
  };
}

// Espejo de applyHint en lib/engine.ts — ver comentario de cabecera.
function applyDailyHint(round: Round, gridSpec: GridSpec, kind: HintKind): Round {
  if (round.status !== "playing") return round;
  const maxHints = DIFFICULTY[gridSpec.difficulty].maxHints;
  if (round.hints.length >= maxHints) return round;
  if (round.hints.some((h) => h.kind === kind)) return round;
  if (kind === "dir" && round.guesses.length === 0) return round;

  const grid = buildGrid(gridSpec);
  const target = grid.target;
  const n = gridSpec.size - 1 || 1;

  let text: string;
  if (kind === "light") {
    const r = target.col / n;
    text = r < 0.34 ? "Oscuro" : r < 0.67 ? "Medio" : "Claro";
  } else if (kind === "sat") {
    const r = (n - target.row) / n;
    text = r < 0.34 ? "Apagado" : r < 0.67 ? "Medio" : "Vivo";
  } else {
    const last = round.guesses[round.guesses.length - 1];
    if (!last) return round;
    const vertical = target.row < last.row ? "arriba" : target.row > last.row ? "abajo" : null;
    const horizontal = target.col < last.col ? "izquierda" : target.col > last.col ? "derecha" : null;
    const arrows: Record<string, string> = {
      "arriba-izquierda": "↖",
      "arriba-derecha": "↗",
      "abajo-izquierda": "↙",
      "abajo-derecha": "↘",
      arriba: "↑",
      abajo: "↓",
      izquierda: "←",
      derecha: "→",
    };
    const key = [vertical, horizontal].filter((v): v is string => v !== null).join("-");
    text = key ? `${key.replace("-", " · ")} ${arrows[key]}` : "aquí mismo";
  }

  return { ...round, hints: [...round.hints, { kind, text }] };
}

function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case "HYDRATE": {
      const round: Round = {
        id: "daily",
        guesserId: PLACEHOLDER_PLAYER_ID,
        setterId: null,
        // word empieza vacío — placeholder hasta que el efecto de abajo la
        // rellene (vía colorWord + SET_CLUE_WORD) o falle en silencio.
        // Diario.tsx trata word==="" como "sin pista todavía", nunca la
        // pasa a ClueBar/Reveal así.
        clue: { type: "word", word: "", targetHex: action.gridSpec.targetHex },
        gridSpec: action.gridSpec,
        guesses: action.cached?.guesses ?? [],
        hints: action.cached?.hints ?? [],
        status: action.cached?.status ?? "playing",
        score: action.cached?.score ?? null,
      };
      return {
        phase: action.cached ? "result" : "playing",
        gridSpec: action.gridSpec,
        round,
        dateKey: action.dateKey,
      };
    }
    case "GUESS": {
      if (state.phase !== "playing" || !state.round || !state.gridSpec) return state;
      const round = applyDailyGuess(state.round, state.gridSpec, action.row, action.col);
      return { ...state, round, phase: round.status !== "playing" ? "result" : "playing" };
    }
    case "REQUEST_HINT": {
      if (state.phase !== "playing" || !state.round || !state.gridSpec) return state;
      const round = applyDailyHint(state.round, state.gridSpec, action.kind);
      return { ...state, round };
    }
    case "SET_CLUE_WORD": {
      if (!state.round) return state;
      return { ...state, round: { ...state.round, clue: { ...state.round.clue, word: action.word } } };
    }
    default:
      return state;
  }
}

export function useDaily(): {
  state: DailyState;
  dispatch: Dispatch<DailyAction>;
  history: DailyHistory;
  auth: ReturnType<typeof useSupabaseAuth>["auth"];
  signInWithGoogle: () => void;
  signOut: () => void;
} {
  const [state, dispatch] = useReducer(dailyReducer, initialDailyState);
  const [history, setHistory] = useState<DailyHistory>({});
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const historyRef = useRef(history);
  // Ref sincronizado en un efecto, no en el cuerpo del render: escribir refs
  // durante el render está desaconsejado bajo renderizado concurrente. Sin
  // array de deps → corre tras CADA render, misma cadencia efectiva que la
  // asignación directa que había aquí antes.
  useEffect(() => {
    historyRef.current = history;
  });
  useEffect(() => {
    // localDateKey() se llama UNA sola vez aquí (misma marca de tiempo `now`
    // que arma gridSpec) y se propaga como state.dateKey — evita que una
    // ronda que cruza la medianoche local se guarde bajo la fecha
    // equivocada (ver dateKey en DailyState).
    const now = new Date();
    const dateKey = localDateKey(now);
    const gridSpec = buildDailyGridSpec(now);

    let currentHistory = readHistory();
    let cached = currentHistory[dateKey] ?? null;
    if (!cached) {
      // Migración de una sola vez: si hoy ya se jugó bajo el esquema viejo
      // (un solo día en localStorage, sin historial), se adopta como la
      // primera entrada del historial — así no se pierde la racha de quien
      // ya jugó hoy antes de que existieran las estadísticas.
      const legacy = readLegacyCache(dateKey);
      if (legacy) {
        currentHistory = writeHistoryEntry(currentHistory, dateKey, legacy);
        cached = legacy;
      }
    }
    setHistory(currentHistory);
    dispatch({ type: "HYDRATE", cached, gridSpec, dateKey });
  }, []);

  // Al iniciar sesión (o al montar ya con sesión activa), fusiona el
  // historial remoto sobre el local y sube lo que falte en remoto — sin
  // botón, automático (ver spec §"Cambios en hooks/useDaily.ts"). Best-effort:
  // un fallo de red aquí no bloquea nada, se reintenta solo (entriesToUpload
  // vuelve a detectar lo no subido) la próxima vez que este efecto corra con
  // sesión activa. historyRef evita depender de `history` en el array de
  // deps — evitaría reejecutar este efecto en cada partida jugada.
  useEffect(() => {
    if (auth.status !== "signed-in" || !auth.userId) return;
    const userId = auth.userId;
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    supabase
      .from("daily_results")
      .select("date_key, status, score, guesses, hints")
      .eq("user_id", userId)
      .limit(REMOTE_HISTORY_ROW_LIMIT)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;

        const remote = rowsToDailyHistory(data as DailyResultRow[]);

        // Guard anti-contaminación entre cuentas: si la última cuenta cuyo
        // historial se fusionó en este navegador (persistido, ver
        // readSyncedUserId) es DISTINTA de la que acaba de entrar, el
        // historial local no es una base segura desde la que subir — puede
        // arrastrar partidas de la cuenta anterior. En ese caso no se sube
        // nada de lo que ya hubiera en local (base vacía): solo se fusiona
        // el remoto de la cuenta nueva para mostrarlo. Las partidas que se
        // jueguen de aquí en adelante sí se detectan y suben con
        // normalidad la próxima vez que este efecto corra.
        const lastSyncedUserId = readSyncedUserId();
        const switchedAccount = lastSyncedUserId !== null && lastSyncedUserId !== userId;
        const localBase: DailyHistory = switchedAccount ? {} : historyRef.current;
        writeSyncedUserId(userId);

        // upsert + ignoreDuplicates → ON CONFLICT DO NOTHING: solo necesita
        // privilegio de INSERT (encaja con la policy insert-only) y nunca
        // reescribe un día ya jugado. Con .insert() a secas, una sola fila
        // que ya existiera en remoto (carrera con el efecto de completar el
        // día de hoy) tumbaría el lote ENTERO y se perdería todo lo demás.
        const rows = dailyHistoryToRows(userId, entriesToUpload(localBase, remote));
        if (rows.length > 0) {
          supabase
            .from("daily_results")
            .upsert(rows, { onConflict: "user_id,date_key", ignoreDuplicates: true })
            .then(() => {}, () => {});
        }

        setHistory((current) => persistHistory(mergeDailyHistory(current, remote)));
      });

    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.userId]);

  useEffect(() => {
    const round = state.round;
    if (state.phase !== "result" || !round || round.status === "playing") return;
    if (history[state.dateKey]) return;
    // status extraído a un const propio: TS no propaga el narrowing de
    // round.status a través del closure de setHistory (solo el de `round`
    // en sí), así que se captura ya con el tipo "solved"|"failed" resuelto.
    const status = round.status;
    const result: DailyResult = { guesses: round.guesses, hints: round.hints, status, score: round.score ?? 0 };
    setHistory((current) => writeHistoryEntry(current, state.dateKey, result));

    // Subida best-effort del resultado de hoy — si falla (sin red, sesión
    // caducada) no se reintenta aquí mismo: el efecto de arriba la recogerá
    // sola la próxima vez que corra con sesión activa (entriesToUpload la
    // seguirá viendo como no subida). Mismo upsert tolerante a conflictos que
    // allí: esta fila puede colisionar con una subida del efecto de fusión.
    if (auth.status === "signed-in" && auth.userId) {
      const supabase = createBrowserSupabaseClient();
      supabase
        .from("daily_results")
        .upsert(dailyHistoryToRows(auth.userId, { [state.dateKey]: result }), {
          onConflict: "user_id,date_key",
          ignoreDuplicates: true,
        })
        .then(() => {}, () => {});
    }
  }, [state.phase, state.round, state.dateKey, history, auth.status, auth.userId]);

  // El efecto de arriba persiste el resultado un render después de que
  // state.phase pase a "result" (setHistory no puede correr en el mismo
  // tick del reducer) — sin esto, la primera vez que se ve DailyStats tras
  // ganar/perder en vivo mostraría la racha/calendario SIN la partida que
  // se acaba de jugar. displayHistory funde la partida de hoy ya conocida
  // (via state.round) por encima de `history`, así el consumidor siempre ve
  // el dato correcto de inmediato, sin esperar al efecto.
  const displayHistory = useMemo((): DailyHistory => {
    const round = state.round;
    if (state.phase !== "result" || !round || round.status === "playing") return history;
    if (history[state.dateKey]) return history;
    return {
      ...history,
      [state.dateKey]: {
        guesses: round.guesses,
        hints: round.hints,
        status: round.status,
        score: round.score ?? 0,
      },
    };
  }, [history, state.phase, state.round, state.dateKey]);

  // Palabra-pista: no bloquea nada (lib/daily.ts sigue generando el color
  // en puro, sin red) — si falla, round.clue.word se queda en "" y
  // Diario.tsx simplemente no muestra pista, como hasta ahora.
  useEffect(() => {
    const gridSpec = state.gridSpec;
    if (!gridSpec || !state.dateKey || state.round?.clue.word) return;

    const cachedWord = readWordCache(state.dateKey);
    if (cachedWord) {
      dispatch({ type: "SET_CLUE_WORD", word: cachedWord });
      return;
    }

    let cancelled = false;
    colorWord(gridSpec.targetHex).then((result) => {
      if (cancelled || !result.ok) return;
      writeWordCache(state.dateKey, result.word);
      dispatch({ type: "SET_CLUE_WORD", word: result.word });
    });
    return () => {
      cancelled = true;
    };
  }, [state.gridSpec, state.dateKey, state.round?.clue.word]);

  return { state, dispatch, history: displayHistory, auth, signInWithGoogle, signOut };
}
