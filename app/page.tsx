"use client";

import { Home } from "../components/screens/Home";
import { Play } from "../components/screens/Play";
import { Setup } from "../components/screens/Setup";
import { useGame } from "../hooks/useGame";

export default function Page() {
  const { state, dispatch } = useGame();

  switch (state.phase) {
    case "home":
      return <Home />;
    case "setup":
      return <Setup />;
    case "playing":
    case "reveal":
      return <Play />;
    default:
      // Salvaguarda para fases sin pantalla construida todavía (curtain,
      // scoreboard — ambas Sprint 4). Duelo sigue bloqueado en Sprint 2, así
      // que no debería alcanzarse, pero mantiene "cero rutas muertas" si algo
      // deja el estado ahí de todos modos.
      return (
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
            Pantalla no disponible todavía
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: "GO_HOME" })}
            className="rounded-[var(--radius-panel)] bg-signal px-4 py-2 font-sans text-sm text-signal-ink"
          >
            Volver al inicio
          </button>
        </main>
      );
  }
}
