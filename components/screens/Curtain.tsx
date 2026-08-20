"use client";

import { useGame } from "../../hooks/useGame";
import { HoldToConfirm } from "../ui/HoldToConfirm";

/**
 * S2 — corte a negro seco entre turnos (PRD §7.3). state.activeIndex ya
 * apunta al adivinador que va a jugar a continuación (lo deja así
 * SUBMIT_CLUE en su rama de duelo) — no hay cálculo que hacer aquí.
 */

const ACCENT_CLASS: Record<"signal" | "muted", string> = {
  signal: "text-signal",
  muted: "text-text",
};

export function Curtain() {
  const { state, dispatch } = useGame();
  const player = state.players[state.activeIndex];
  if (!player) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-surface-0 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Turno de
        </span>
        <h1
          className={`font-sans text-3xl uppercase tracking-[0.15em] ${ACCENT_CLASS[player.accent]}`}
        >
          {player.name}
        </h1>
      </div>
      <HoldToConfirm label="Mantén pulsado" onConfirm={() => dispatch({ type: "UNLOCK_CURTAIN" })} />
    </main>
  );
}
