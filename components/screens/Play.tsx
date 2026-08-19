"use client";

import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { bestGuess, scoreBreakdown } from "../../lib/engine";
import { buildGrid } from "../../lib/grid";
import { DIFFICULTY } from "../../lib/types";
import type { HintKind } from "../../lib/types";
import { ClueBar } from "../game/ClueBar";
import { ColorCard } from "../game/ColorCard";
import { HintRow } from "../game/HintRow";
import { Reveal } from "../game/Reveal";
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

export function Play() {
  const { state, dispatch } = useGame();
  const [confirmingExit, setConfirmingExit] = useState(false);
  const round = state.currentRound !== null ? state.rounds[state.currentRound] : null;

  // round.gridSpec no cambia de referencia entre GUESS/REQUEST_HINT (el
  // reducer solo actualiza guesses/hints/status/score) — memoizar sobre él,
  // no sobre `round`, evita repetir la búsqueda binaria de buildGrid en
  // cada tiro.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(() => (round ? buildGrid(round.gridSpec) : null), [round?.gridSpec]);

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
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center gap-6 px-4 pt-10 pb-6">
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
      </div>

      {isPlaying ? (
        <>
          <ClueBar clue={round.clue} />
          <ColorCard
            grid={grid}
            guesses={round.guesses}
            disabled={false}
            revealTarget={false}
            onTap={handleTap}
          />
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
        </>
      ) : (
        <Reveal
          clue={round.clue}
          grid={grid}
          guesses={round.guesses}
          best={best}
          status={round.status === "solved" ? "solved" : "failed"}
          verdict={verdictFor(best?.ring ?? 99)}
          score={round.score ?? 0}
          breakdown={scoreBreakdown(round)}
          actionLabel="Otra ronda"
          onAction={() => dispatch({ type: "NEXT" })}
        />
      )}
    </div>
  );
}
