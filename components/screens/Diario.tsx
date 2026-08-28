"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDaily } from "../../hooks/useDaily";
import { useTheme } from "../../hooks/useTheme";
import { buildShareText } from "../../lib/daily";
import { isSupabaseConfigured } from "../../lib/supabase";
import { bestGuess, scoreBreakdown } from "../../lib/engine";
import { buildGrid } from "../../lib/grid";
import { DIFFICULTY } from "../../lib/types";
import type { HintKind } from "../../lib/types";
import { ClueBar } from "../game/ClueBar";
import { ColorCard } from "../game/ColorCard";
import { DailyStats } from "../game/DailyStats";
import { HintRow } from "../game/HintRow";
import { Reveal } from "../game/Reveal";
import { Thermometer } from "../game/Thermometer";

/**
 * Diario — ruta propia, no pasa por el switch(state.phase) de Solo/Duelo
 * (ver docs/superpowers/specs/2026-08-23-modo-diario-design.md). El color
 * del día sigue siendo puro/determinista por fecha (lib/daily.ts, sin red);
 * la palabra-pista es una etiqueta que se le pone DESPUÉS vía IA inversa
 * (lib/color-word.ts, ver hooks/useDaily.ts) — decorativa, no bloqueante:
 * si `round.clue.word` está vacío (aún no llegó, o falló) simplemente no se
 * muestra ClueBar/panel "Pista", el juego funciona igual. Tras acabar la
 * partida de hoy se muestra DailyStats (racha/calendario/cuenta atrás),
 * calculado sobre el historial completo (hooks/useDaily.ts, un DailyResult
 * por fecha) — no solo el día de hoy.
 * Cuenta (Google vía Supabase Auth, opcional — ver
 * docs/superpowers/specs/2026-08-28-diario-account-sync-design.md): el
 * botón de sesión solo aparece si isSupabaseConfigured() es true; sin eso
 * configurado, Diario funciona exactamente igual que antes, 100% local.
 */

function verdictFor(ring: number): string {
  if (ring === 0) return "Clavado.";
  if (ring === 1) return "A un matiz.";
  if (ring === 2) return "Buen ojo.";
  return "Ese matiz engaña.";
}

export function Diario() {
  const { state, dispatch, history, auth, signInWithGoogle, signOut } = useDaily();
  const [theme, toggleTheme] = useTheme();
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grid = useMemo(() => (state.round ? buildGrid(state.round.gridSpec) : null), [state.round?.gridSpec]);

  if (state.phase === "loading" || !state.round || !grid) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Cargando el matiz de hoy…
        </p>
      </main>
    );
  }

  const round = state.round;
  const lastGuess = round.guesses[round.guesses.length - 1];
  const best = bestGuess(round);

  function handleTap(row: number, col: number) {
    dispatch({ type: "GUESS", row, col });
  }

  function handleHint(kind: HintKind) {
    dispatch({ type: "REQUEST_HINT", kind });
  }

  async function handleShare() {
    const text = buildShareText(state.dateKey, {
      guesses: round.guesses,
      hints: round.hints,
      status: round.status === "solved" ? "solved" : "failed",
      score: round.score ?? 0,
    });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
      } catch {
        // usuario canceló el share nativo, o el navegador lo rechazó — no es un error de la app
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("copied");
        setTimeout(() => setShareStatus("idle"), 1500);
      } catch {
        // portapapeles denegado (permisos/foco) — no es un error de la app
      }
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center gap-6 bg-surface-0 px-4 pt-10 pb-6">
      <div className="flex w-full max-w-xs items-center justify-between">
        <Link href="/" aria-label="Volver" className="font-mono text-lg text-text-muted">
          ←
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
          Diario · {state.dateKey}
        </span>
        <div className="flex items-center gap-2">
          {isSupabaseConfigured() && (
            <button
              type="button"
              onClick={auth.status === "signed-in" ? signOut : signInWithGoogle}
              aria-label={auth.status === "signed-in" ? "Cerrar sesión" : "Iniciar sesión con Google"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
            >
              {auth.status === "signed-in" ? "◐" : "○"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Activar tema claro" : "Activar tema oscuro"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>

      {state.phase === "playing" ? (
        <>
          {round.clue.word && <ClueBar clue={round.clue} />}
          {/* Solo el gradiente de color queda oscuro siempre (PRD §5.2); el
              resto de la pantalla sigue el tema claro/oscuro normal. */}
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
            maxHints={DIFFICULTY[round.gridSpec.difficulty].maxHints}
            hasGuessed={round.guesses.length > 0}
            disabled={false}
            onRequestHint={handleHint}
          />
        </>
      ) : (
        <>
          <Reveal
            clue={round.clue.word ? round.clue : undefined}
            grid={grid}
            guesses={round.guesses}
            best={best}
            verdict={verdictFor(best?.ring ?? 99)}
            score={round.score ?? 0}
            breakdown={scoreBreakdown(round)}
            actionLabel={shareStatus === "copied" ? "Copiado" : "Compartir resultado"}
            onAction={handleShare}
          />
          <DailyStats history={history} todayKey={state.dateKey} />
          <Link href="/" className="font-sans text-sm text-text-muted underline">
            Volver a inicio
          </Link>
        </>
      )}
    </div>
  );
}
