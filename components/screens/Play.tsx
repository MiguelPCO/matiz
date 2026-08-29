"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { useTheme } from "../../hooks/useTheme";
import { colorWord } from "../../lib/color-word";
import { isSupabaseConfigured } from "../../lib/supabase";
import { bestGuess, scoreBreakdown } from "../../lib/engine";
import { buildGrid } from "../../lib/grid";
import { DIFFICULTY, MAX_GUESSES } from "../../lib/types";
import type { HintKind } from "../../lib/types";
import { ClueBar } from "../game/ClueBar";
import { ColorCard } from "../game/ColorCard";
import { HintRow } from "../game/HintRow";
import { ProfileButton } from "../ui/ProfileButton";
import { Reveal } from "../game/Reveal";
import { Profile } from "./Profile";
import { Thermometer } from "../game/Thermometer";

/**
 * S3 — pantalla principal (PRD §6: "todo lo demás existe para llegar a ella
 * o cerrarla"). El reveal delega en Reveal.tsx (PRD §7.2, Sprint 3).
 */

function verdictFor(ring: number): string {
  if (ring === 0) return "Clavado.";
  if (ring === 1) return "A un matiz.";
  if (ring === 2) return "Buen ojo.";
  return "Ese matiz engaña.";
}

type ExtraHintState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; word: string }
  | { status: "error" };

export function Play() {
  const { state, dispatch } = useGame();
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [extraHint, setExtraHint] = useState<ExtraHintState>({ status: "idle" });
  const round = state.currentRound !== null ? state.rounds[state.currentRound] : null;

  // round.gridSpec no cambia de referencia entre GUESS/REQUEST_HINT (el
  // reducer solo actualiza guesses/hints/status/score) — memoizar sobre él,
  // no sobre `round`, evita repetir la búsqueda binaria de buildGrid en
  // cada tiro.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(() => (round ? buildGrid(round.gridSpec) : null), [round?.gridSpec]);

  // Última bala en solo: pista extra gratis (una palabra distinta a la
  // original) para ayudar a acertar el último tiro. No cuenta como Hint del
  // motor (sin coste de puntos, sin pasar por REQUEST_HINT) — es un rescate
  // de UI, no una pista comprada. `onLastGuess` es el único dep real del
  // efecto: dispara una sola vez al pasar de false→true dentro de la ronda,
  // nunca se re-dispara por su propio setExtraHint (evita el bug de
  // auto-cancelación que ya se dio en Setup.tsx con este mismo patrón).
  const onLastGuess =
    state.mode === "solo" && round?.status === "playing" && round.guesses.length === MAX_GUESSES - 1;

  const fetchExtraHint = useCallback(async (targetHex: string, excludeWord: string | undefined) => {
    setExtraHint({ status: "loading" });
    const result = await colorWord(targetHex, excludeWord);
    setExtraHint(result.ok ? { status: "ready", word: result.word } : { status: "error" });
  }, []);

  useEffect(() => {
    if (onLastGuess && round) fetchExtraHint(round.clue.targetHex, round.clue.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLastGuess, fetchExtraHint]);

  if (!round || !grid) return null;

  const isPlaying = round.status === "playing";
  const lastGuess = round.guesses[round.guesses.length - 1];
  const best = bestGuess(round);

  function handleTap(row: number, col: number) {
    dispatch({ type: "GUESS", row, col });
  }

  function handleHint(kind: HintKind) {
    dispatch({ type: "REQUEST_HINT", kind });
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center gap-6 bg-surface-0 px-4 pt-10 pb-6">
      <div className="flex w-full max-w-xs items-center justify-between">
        {!confirmingExit ? (
          <button
            type="button"
            onClick={() => setConfirmingExit(true)}
            aria-label="Volver"
            className="font-mono text-lg text-text-muted"
          >
            ←
          </button>
        ) : (
          <div className="flex items-center gap-2 font-sans text-xs">
            <span className="text-text-muted">¿Salir? Perderás la ronda.</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "GO_HOME" })}
              className="text-signal"
            >
              Salir
            </button>
            <button
              type="button"
              onClick={() => setConfirmingExit(false)}
              className="text-text-muted"
            >
              Cancelar
            </button>
          </div>
        )}
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
        </div>
      </div>

      {isPlaying ? (
        <>
          <ClueBar clue={round.clue} />
          {/* Solo el gradiente de color queda oscuro siempre (PRD §5.2 —
              fondo neutro necesario para juzgar color sin interferencia);
              el resto de la pantalla sigue el tema claro/oscuro normal. */}
          <div data-theme="dark" className="w-full max-w-xs rounded-[var(--radius-frame)] bg-surface-0 p-3">
            <ColorCard
              grid={grid}
              guesses={round.guesses}
              disabled={false}
              revealTarget={false}
              onTap={handleTap}
            />
          </div>
          <div className="w-full max-w-xs">
            <Thermometer closeness={lastGuess?.closeness ?? null} />
          </div>
          <HintRow
            hints={round.hints}
            maxHints={DIFFICULTY[state.config.difficulty].maxHints}
            hasGuessed={round.guesses.length > 0}
            disabled={!isPlaying}
            onRequestHint={handleHint}
          />
          {onLastGuess && extraHint.status !== "idle" && (
            <div className="w-full max-w-xs rounded-[var(--radius-panel)] bg-surface-1 p-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
                Última pista
              </span>
              {extraHint.status === "ready" ? (
                <p className="mt-1 font-sans text-lg text-text">{extraHint.word}</p>
              ) : extraHint.status === "loading" ? (
                <p className="mt-1 font-sans text-sm text-text-muted">Buscando pista…</p>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel={
            state.mode === "solo" ? "Otra ronda" : state.rounds.length >= 2 ? "Ver marcador" : "Continuar"
          }
          onAction={() => dispatch({ type: "NEXT" })}
        />
      )}
      <Profile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        auth={auth}
        signInWithGoogle={signInWithGoogle}
        signOut={signOut}
      />
    </div>
  );
}
