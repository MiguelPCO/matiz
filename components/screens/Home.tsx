"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useGame } from "../../hooks/useGame";
import { useTheme } from "../../hooks/useTheme";
import { useSupabaseAuth } from "../../hooks/useSupabaseAuth";
import { isSupabaseConfigured } from "../../lib/supabase";
import { oklchToHex } from "../../lib/color";
import { Button } from "../ui/Button";
import { Label } from "../ui/Label";
import { ProfileButton } from "../ui/ProfileButton";
import { Profile } from "./Profile";
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
  const [theme, toggleTheme] = useTheme();
  const { auth, signInWithGoogle, signOut } = useSupabaseAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [collectingNames, setCollectingNames] = useState(false);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const strip = useCalibrationStrip();

  function handleStartDuel() {
    dispatch({ type: "START_DUEL", names: [nameA, nameB] });
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-10 px-4">
      <div className="absolute top-6 right-6 flex items-center gap-2">
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

      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-sans text-3xl tracking-[0.35em] text-text uppercase">
          MAT<span className="text-signal">I</span>Z
        </h1>
        <p className="font-sans text-sm text-text-muted">Lee el color a ciegas.</p>
      </div>

      <div className="flex w-full gap-1">
        {strip.map((hex, i) => (
          <div key={i} className="h-2 flex-1 rounded-full" style={{ backgroundColor: hex }} aria-hidden="true" />
        ))}
      </div>

      {collectingNames ? (
        <div className="flex w-full flex-col gap-3">
          <div>
            <Label className="mb-1.5 block">Jugador 1</Label>
            <input
              aria-label="Jugador 1"
              value={nameA}
              onChange={(e) => setNameA(e.target.value)}
              placeholder="J1"
              className="w-full rounded-[var(--radius-panel)] border border-line bg-surface-1 px-3 py-2 font-sans text-sm text-text"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Jugador 2</Label>
            <input
              aria-label="Jugador 2"
              value={nameB}
              onChange={(e) => setNameB(e.target.value)}
              placeholder="J2"
              className="w-full rounded-[var(--radius-panel)] border border-line bg-surface-1 px-3 py-2 font-sans text-sm text-text"
            />
          </div>
          <Button variant="primary" onClick={handleStartDuel}>
            Empezar duelo
          </Button>
          <Button variant="ghost" onClick={() => setCollectingNames(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <Button variant="primary" onClick={() => dispatch({ type: "START_SOLO", config: state.config })}>
            Solo
          </Button>
          <Button variant="secondary" onClick={() => setCollectingNames(true)}>
            Duelo
          </Button>
          <Link
            href="/diario"
            className="rounded-[var(--radius-panel)] border border-line py-3 text-center font-sans text-sm font-medium text-text"
          >
            Diario
          </Link>
        </div>
      )}

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
