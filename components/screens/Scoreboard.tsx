"use client";

import { winnerBreakdown, type WinnerStage } from "../../lib/engine";
import { useGame } from "../../hooks/useGame";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";

/** S5 — comparativa final del duelo (PRD §6). El motor solo da datos (winnerBreakdown); el texto vive aquí. */

const STAGE_COPY: Record<WinnerStage, string> = {
  score: "por puntuación",
  hints: "usó menos pistas",
  guesses: "acertó en menos tiros",
  closeness: "por precisión en el mejor tiro",
  tie: "",
};

export function Scoreboard() {
  const { state, dispatch } = useGame();
  const { winnerId, stage } = winnerBreakdown(state);
  const round1 = state.rounds[0];
  const round2 = state.rounds[1];

  if (!round1 || !round2) return null;

  const rows = state.players.map((player) => {
    const round = player.id === round1.guesserId ? round1 : round2;
    return {
      player,
      score: round.score ?? 0,
      hints: round.hints.length,
      guesses: round.guesses.length,
    };
  });

  const winnerName = state.players.find((p) => p.id === winnerId)?.name;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-8 px-4">
      <Label>Marcador</Label>

      <div className="flex w-full flex-col gap-3">
        {rows.map(({ player, score, hints, guesses }) => (
          <div
            key={player.id}
            className={`flex items-center justify-between rounded-[var(--radius-panel)] bg-surface-1 p-4 ${
              player.id === winnerId ? "ring-2 ring-signal" : ""
            }`}
          >
            <div>
              <p className={`font-sans text-lg ${player.accent === "signal" ? "text-signal" : "text-text"}`}>
                {player.name}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
                {hints} pista{hints === 1 ? "" : "s"} · {guesses} tiro{guesses === 1 ? "" : "s"}
              </p>
            </div>
            <p className="font-mono text-2xl font-bold text-text">{score}</p>
          </div>
        ))}
      </div>

      <p className="text-center font-sans text-sm text-text-muted">
        {winnerId && winnerName ? `Gana ${winnerName} — ${STAGE_COPY[stage]}` : "Empate perfecto."}
      </p>

      <div className="flex w-full flex-col gap-3">
        <Button variant="primary" onClick={() => dispatch({ type: "REMATCH" })}>
          Revancha
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: "GO_HOME" })}>
          Inicio
        </Button>
      </div>
    </main>
  );
}
