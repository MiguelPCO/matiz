"use client";

import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { oklchToHex } from "../../lib/color";
import { Button } from "../ui/Button";
import { HowToPlay } from "./HowToPlay";

const STRIP_COUNT = 10;

/** Tira decorativa: barrido de L a C/H fijos, mismo tono que el acento ámbar. */
function useCalibrationStrip(): readonly string[] {
  return useMemo(() => {
    const swatches: string[] = [];
    for (let i = 0; i < STRIP_COUNT; i++) {
      const L = 0.25 + (i / (STRIP_COUNT - 1)) * 0.6;
      swatches.push(oklchToHex({ L, C: 0.1, H: 68 }));
    }
    return swatches;
  }, []);
}

export function Home() {
  const { state, dispatch } = useGame();
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const strip = useCalibrationStrip();

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-10 px-4">
      <button
        type="button"
        onClick={() => setHowToPlayOpen(true)}
        aria-label="Cómo se juega"
        className="absolute top-6 right-6 font-mono text-xs text-text-faint"
      >
        ?
      </button>

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-sans text-3xl tracking-[0.35em] text-text uppercase">
          MAT<span className="text-signal">I</span>Z
        </h1>
        <p className="font-sans text-sm text-text-muted">Lee el color a ciegas.</p>
      </div>

      <div className="flex w-full gap-1">
        {strip.map((hex, i) => (
          <div
            key={i}
            className="h-2 flex-1 rounded-full"
            style={{ backgroundColor: hex }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="flex w-full flex-col gap-3">
        <Button
          variant="primary"
          onClick={() => dispatch({ type: "START_SOLO", config: state.config })}
        >
          Solo
        </Button>
        <Button variant="secondary" disabled aria-disabled="true">
          Duelo · Próximamente
        </Button>
        <Button variant="secondary" disabled aria-disabled="true">
          Diario · Próximamente
        </Button>
      </div>

      <HowToPlay open={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
    </main>
  );
}
