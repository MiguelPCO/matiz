"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useTheme } from "../../hooks/useTheme";
import { useGame } from "../../hooks/useGame";
import { extractColor } from "../../lib/extract";
import { pickSoloWord } from "../../lib/solo-words";
import { isSupabaseConfigured } from "../../lib/supabase";
import { DIFFICULTY } from "../../lib/types";
import type { Clue, ClueType, Difficulty, GridSize, Hex } from "../../lib/types";
import { wordToColor } from "../../lib/word-color";
import type { WordColorResult } from "../../lib/word-color";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { Segmented } from "../ui/Segmented";
import { ProfileButton } from "../ui/ProfileButton";
import { HowToPlay } from "./HowToPlay";
import { Profile } from "./Profile";

/**
 * S1 — pista, tamaño, dificultad. El selector de tamaño/dificultad se
 * muestra siempre en Solo — el onboarding original de PRD §7.1.4 (ocultarlo
 * en la primera partida, `state.hasPlayed`) generaba confusión: `hasPlayed`
 * solo vive en memoria (useReducer sin persistencia), así que cualquier
 * recarga de página se veía como "primera partida" otra vez y el selector
 * desaparecía sin patrón aparente. Decisión explícita de Miguel (2026-08-27):
 * revertir esa regla, mostrar el selector siempre. `hasPlayed` se conserva
 * en el motor (lib/engine.ts) por si se necesita para otra cosa — solo deja
 * de leerse aquí.
 *
 * Solo vs. Duelo difieren en quién pone la pista: en Duelo la eliges TÚ
 * para que la adivine tu rival (secreto solo hasta la Cortina, ver
 * Sprint 4) — en Solo la vas a adivinar tú mismo, así que si tú mismo la
 * escribieras ya sabrías la respuesta. Por eso Solo genera la pista al
 * azar (pickSoloWord + wordToColor) en vez de pedirte que la escribas, y
 * nunca enseña el swatch antes de jugar.
 */

type ClueDraft =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; targetHex: Hex; word?: string; imageSrc?: string }
  | { status: "error"; reason: "network" | "invalid" | "timeout" | "image" };

const SIZE_OPTIONS = ([4, 5, 6, 8] as const).map((v) => ({ value: v, label: `${v}×${v}` }));
const DIFFICULTY_OPTIONS = (["facil", "medio", "dificil"] as const).map((v) => ({
  value: v,
  label: DIFFICULTY[v].label,
}));
const CLUE_TYPE_OPTIONS: readonly { value: ClueType; label: string }[] = [
  { value: "word", label: "Palabra" },
  { value: "image", label: "Imagen" },
];
// Solo: sin fuente de imágenes al azar todavía — deshabilitada hasta curar
// una galería (ver MATIZ-SPRINTS.md).
const CLUE_TYPE_OPTIONS_SOLO: readonly { value: ClueType; label: string; disabled?: boolean }[] = [
  { value: "word", label: "Palabra" },
  { value: "image", label: "Imagen", disabled: true },
];

const WORD_ERROR_COPY: Record<"network" | "invalid" | "timeout", string> = {
  network: "No se pudo contactar con el servicio de color.",
  timeout: "El servicio tardó demasiado en responder.",
  invalid: "No se pudo derivar un color de esa palabra.",
};

const MAX_STORED_IMAGE_EDGE = 640;
const LAST_SOLO_WORD_KEY = "matiz-last-solo-word";

function readLastSoloWord(): string | null {
  try {
    return localStorage.getItem(LAST_SOLO_WORD_KEY);
  } catch {
    return null;
  }
}

function writeLastSoloWord(word: string): void {
  try {
    localStorage.setItem(LAST_SOLO_WORD_KEY, word);
  } catch {
    // localStorage no disponible (privado/bloqueado) — no es crítico, solo se pierde la garantía de no-repetición
  }
}

function downscaleToDataUrl(img: HTMLImageElement, maxEdge: number): string {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function Setup() {
  const { state, dispatch } = useGame();
  const isSolo = state.mode === "solo";
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [clueType, setClueType] = useState<ClueType>("word");
  const [word, setWord] = useState("");
  const [draft, setDraft] = useState<ClueDraft>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duelo: el selector se muestra en la ronda 1 y se bloquea desde la
  // ronda 2 en adelante — misma config para ambos jugadores (PRD §4.8).
  // Solo: siempre visible (ver comentario de cabecera del componente).
  const showPicker = state.mode === "duel" ? state.rounds.length === 0 : true;

  const rival = state.mode === "duel" ? state.players[1 - state.activeIndex] : null;
  const pistaLabel = rival ? `Pista para ${rival.name}` : "Pista";

  // Solo: la pista sale al azar (ver comentario de cabecera). generateRandomClue
  // es estable (useCallback, sin deps) a propósito: si el efecto dependiera de
  // draft.status para decidir "solo cuando idle", su propio setDraft("loading")
  // cambiaría esa dependencia y el efecto se auto-desmontaría a mitad de la
  // petición (cleanup marca cancelled=true antes de que resuelva el fetch) —
  // la carta se quedaba colgada en "Generando pista…" para siempre (visto en
  // vivo). Al no depender de draft.status, el efecto solo corre una vez por
  // mount; "Reintentar" llama a la misma función directamente.
  const generateRandomClue = useCallback(async () => {
    setDraft({ status: "loading" });
    const lastWord = readLastSoloWord();
    const word = pickSoloWord(lastWord ?? undefined);
    const result = await wordToColor(word);
    if (!result.ok) {
      setDraft({ status: "error", reason: result.reason });
      return;
    }
    writeLastSoloWord(word);
    setDraft({ status: "ready", targetHex: result.hex, word });
  }, []);

  useEffect(() => {
    if (isSolo) generateRandomClue();
  }, [isSolo, generateRandomClue]);

  async function revealWordColor(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    setDraft({ status: "loading" });
    const result: WordColorResult = await wordToColor(trimmed);
    if (!result.ok) {
      setDraft({ status: "error", reason: result.reason });
      return;
    }
    setDraft({ status: "ready", targetHex: result.hex, word: trimmed });
  }

  function handleFileChosen(file: File) {
    setDraft({ status: "loading" });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        setDraft({ status: "error", reason: "image" });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const targetHex = extractColor(img);
        const imageSrc = downscaleToDataUrl(img, MAX_STORED_IMAGE_EDGE);
        setDraft({ status: "ready", targetHex, imageSrc });
      };
      img.onerror = () => setDraft({ status: "error", reason: "image" });
      img.src = dataUrl;
    };
    reader.onerror = () => setDraft({ status: "error", reason: "image" });
    reader.readAsDataURL(file);
  }

  function handleEmpezar() {
    if (draft.status !== "ready") return;
    const clue: Clue = draft.imageSrc
      ? { type: "image", imageSrc: draft.imageSrc, targetHex: draft.targetHex }
      : { type: "word", word: draft.word, targetHex: draft.targetHex };
    dispatch({
      type: "SUBMIT_CLUE",
      clue,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
  }

  const isLoading = draft.status === "loading";
  const isError = draft.status === "error";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-4 pt-10 pb-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => dispatch({ type: "GO_HOME" })}
          aria-label="Volver"
          className="font-mono text-lg text-text-muted"
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {isSupabaseConfigured() && (
            <ProfileButton signedIn={auth.status === "signed-in"} onClick={() => setProfileOpen(true)} />
          )}
          <button
            type="button"
            onClick={() => setHowToPlayOpen(true)}
            aria-label="Cómo se juega"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            ?
          </button>
        </div>
      </div>

      {showPicker && (
        <div className="flex flex-col gap-4">
          <div>
            <Label className="mb-1.5 block">Tamaño</Label>
            <Segmented
              options={SIZE_OPTIONS}
              value={state.config.size}
              onChange={(size: GridSize) => dispatch({ type: "SET_CONFIG", config: { size } })}
              aria-label="Tamaño de la carta"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Dificultad</Label>
            <Segmented
              options={DIFFICULTY_OPTIONS}
              value={state.config.difficulty}
              onChange={(difficulty: Difficulty) =>
                dispatch({ type: "SET_CONFIG", config: { difficulty } })
              }
              aria-label="Dificultad"
            />
          </div>
        </div>
      )}

      {/*
        Tipo de pista fuera de showPicker a propósito: en duelo, tamaño y
        dificultad se bloquean tras la ronda 1 (misma configuración para
        ambos jugadores, PRD §4.8), pero cada jugador elige su propio
        palabra/imagen al poner pista — bloquearlo dejaba al segundo
        jugador sin poder cambiar de palabra a imagen. En solo, "imagen"
        va deshabilitada (ver CLUE_TYPE_OPTIONS_SOLO) — sin fuente de
        imágenes al azar todavía.
      */}
      <div>
        <Label className="mb-1.5 block">Tipo de pista</Label>
        <Segmented
          options={isSolo ? CLUE_TYPE_OPTIONS_SOLO : CLUE_TYPE_OPTIONS}
          value={clueType}
          onChange={(v: ClueType) => {
            setClueType(v);
            if (!isSolo) setDraft({ status: "idle" });
          }}
          aria-label="Tipo de pista"
        />
      </div>

      {isSolo ? (
        // Solo: la pista es al azar (ver comentario de cabecera del
        // componente) — nunca se muestra el swatch antes de jugar, o el
        // propio jugador vería la respuesta antes de adivinarla.
        <>
          {draft.status === "loading" && (
            <p className="font-sans text-sm text-text-muted">Generando pista…</p>
          )}
          {draft.status === "ready" && (
            <p className="font-sans text-sm text-text-muted">Pista lista.</p>
          )}
          {draft.status === "error" && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] bg-surface-1 p-3">
              <p className="font-sans text-xs text-text-muted">
                {draft.reason === "image" ? "No se pudo leer la imagen." : WORD_ERROR_COPY[draft.reason]}
              </p>
              <Button variant="secondary" onClick={() => generateRandomClue()}>
                Reintentar
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {clueType === "word" ? (
            <div key="word" className="flex flex-col gap-2">
              <Label className="block">{pistaLabel}</Label>
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="Palabra (p. ej. óxido)"
                aria-label={pistaLabel}
                disabled={isLoading}
                className="rounded-[var(--radius-panel)] border border-line bg-surface-1 px-3 py-2 font-sans text-sm text-text"
              />
              <Button
                variant="secondary"
                onClick={() => revealWordColor(word)}
                disabled={isLoading || word.trim().length === 0}
              >
                {isLoading ? "Revelando color…" : "Revelar color"}
              </Button>
            </div>
          ) : (
            <div key="image" className="flex flex-col gap-2">
              <Label className="block">{pistaLabel}</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChosen(file);
                }}
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? "Leyendo imagen…" : "Elegir imagen"}
              </Button>
            </div>
          )}

          {isError && draft.status === "error" && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-panel)] bg-surface-1 p-3">
              <p className="font-sans text-xs text-text-muted">
                {draft.reason === "image"
                  ? "No se pudo leer la imagen."
                  : WORD_ERROR_COPY[draft.reason]}
              </p>
              <div className="flex gap-2">
                {draft.reason === "image" ? (
                  <>
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                      Elegir otra imagen
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setClueType("word");
                        setDraft({ status: "idle" });
                      }}
                    >
                      Probar con palabra
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => revealWordColor(word)}>
                      Reintentar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setClueType("image");
                        setDraft({ status: "idle" });
                      }}
                    >
                      Probar con una imagen
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {draft.status === "ready" && (
            <div
              className="h-16 w-16 rounded-[var(--radius-swatch)]"
              style={{ backgroundColor: draft.targetHex }}
              aria-hidden="true"
            />
          )}
        </>
      )}

      <Button variant="primary" onClick={handleEmpezar} disabled={draft.status !== "ready"}>
        Empezar
      </Button>

      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        auth={auth}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
      />
    </main>
  );
}
