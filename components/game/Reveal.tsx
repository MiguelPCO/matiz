"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { prefersReducedMotion } from "../../lib/gsap";
import type { Clue, Grid, Guess } from "../../lib/types";
import { ColorCard } from "./ColorCard";

interface RevealProps {
  readonly clue: Clue;
  readonly grid: Grid;
  readonly guesses: readonly Guess[];
  readonly best: Guess | null;
  readonly status: "solved" | "failed";
  readonly verdict: string;
  readonly score: number;
  readonly breakdown: { readonly base: number; readonly penalty: number };
  readonly actionLabel: string;
  readonly onAction: () => void;
}

const HAPTIC_FAIL = [40];
const HAPTIC_SUCCESS = [30, 60, 30, 60, 30];

function vibrate(pattern: number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

/**
 * S3 clímax (PRD §7.2). Props puros — sin useGame() — para que el duelo
 * (Sprint 4) pueda reutilizarlo tal cual, per la decisión con Miguel.
 */
export function Reveal({
  clue,
  grid,
  guesses,
  best,
  status,
  verdict,
  score,
  breakdown,
  actionLabel,
  onAction,
}: RevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const wordSwatchRef = useRef<HTMLDivElement>(null);

  const target = grid.target;
  const showLine = best !== null && (best.row !== target.row || best.col !== target.col);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const container = containerRef.current;
      if (!container) return;

      const tl = gsap.timeline();

      // 0.0s — atenuar swatches no-objetivo (el CSS ya las deja en 0.35 por
      // defecto — partimos de opacidad 1 y bajamos, para que el estado sin
      // JS ya sea el correcto).
      const nonTarget = container.querySelectorAll<HTMLElement>("[data-row]:not([data-target])");
      gsap.set(nonTarget, { opacity: 1 });
      tl.to(nonTarget, { opacity: 0.35, duration: 0.3 }, 0);

      // 0.2s — pulso del objetivo
      const targetEl = container.querySelector<HTMLElement>("[data-target]");
      if (targetEl) {
        tl.fromTo(
          targetEl,
          { scale: 1 },
          { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.inOut" },
          0.2,
        );
      }

      // 0.5s — línea punteada mejor-tiro → objetivo (transform-only: ver spec §"Conflicto stroke-dashoffset")
      if (showLine && best && targetEl && lineRef.current) {
        const bestEl = container.querySelector<HTMLElement>(
          `[data-row="${best.row}"][data-col="${best.col}"]`,
        );
        if (bestEl) {
          const containerRect = container.getBoundingClientRect();
          const fromRect = bestEl.getBoundingClientRect();
          const toRect = targetEl.getBoundingClientRect();
          const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
          const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
          const x2 = toRect.left + toRect.width / 2 - containerRect.left;
          const y2 = toRect.top + toRect.height / 2 - containerRect.top;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.hypot(dx, dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

          gsap.set(lineRef.current, {
            left: x1,
            top: y1,
            width: length,
            rotate: angle,
            scaleX: 0,
            opacity: 1,
            transformOrigin: "left center",
          });
          tl.to(lineRef.current, { scaleX: 1, duration: 0.3, ease: "power2.out" }, 0.5);
        }
      }

      // 0.8s — cross-fade de la pista (opacity-only: ver spec §"Conflicto filter")
      if (clue.type === "image") {
        const colorImg = container.querySelector<HTMLElement>("[data-clue-color]");
        if (colorImg) {
          gsap.set(colorImg, { opacity: 0 });
          tl.to(colorImg, { opacity: 1, duration: 0.9, ease: "none" }, 0.8);
        }
      } else if (wordSwatchRef.current) {
        gsap.set(wordSwatchRef.current, { scale: 0 });
        tl.to(wordSwatchRef.current, { scale: 1, duration: 0.4, ease: "back.out(1.7)" }, 0.8);
      }

      // 1.1s — score cuenta hacia arriba + háptico
      if (scoreRef.current) {
        const counter = { value: 0 };
        tl.to(
          counter,
          {
            value: score,
            duration: 0.5,
            ease: "power2.out",
            onUpdate: () => {
              if (scoreRef.current) scoreRef.current.textContent = String(Math.round(counter.value));
            },
          },
          1.1,
        );
      }
      tl.call(() => vibrate(status === "solved" ? HAPTIC_SUCCESS : HAPTIC_FAIL), [], 1.1);

      // 1.4s — panel de acciones
      const panel = container.querySelector<HTMLElement>("[data-action-panel]");
      if (panel) {
        gsap.set(panel, { y: 24, opacity: 0 });
        tl.to(panel, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, 1.4);
      }
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className="relative flex w-full max-w-xs flex-col items-center gap-6">
      {clue.type === "word" ? (
        <div className="flex w-full items-center gap-3 rounded-[var(--radius-panel)] bg-surface-1 p-3">
          <div className="flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
              Pista
            </span>
            <p className="mt-1 font-sans text-xl text-text">{clue.word}</p>
          </div>
          <div
            ref={wordSwatchRef}
            className="h-12 w-12 shrink-0 rounded-[var(--radius-swatch)]"
            style={{ backgroundColor: clue.targetHex }}
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="w-full rounded-[var(--radius-panel)] bg-surface-1 p-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
            Pista
          </span>
          <div className="relative mt-2 h-24 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={clue.imageSrc}
              alt="Pista visual"
              className="absolute inset-0 h-full w-full rounded-[var(--radius-swatch)] object-cover grayscale"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-clue-color
              src={clue.imageSrc}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full rounded-[var(--radius-swatch)] object-cover"
            />
          </div>
        </div>
      )}

      <ColorCard grid={grid} guesses={guesses} disabled revealTarget onTap={() => {}} />

      <div
        ref={lineRef}
        className="pointer-events-none absolute h-0.5 origin-left border-t-2 border-dotted border-signal opacity-0"
      />

      <div className="text-center">
        <p className="font-sans text-lg text-text">{verdict}</p>
        <p className="mt-1 font-mono text-3xl font-bold text-signal">
          <span ref={scoreRef}>{score}</span>
        </p>
        {breakdown.penalty > 0 && (
          <p className="mt-0.5 font-mono text-xs text-text-faint">
            {breakdown.base} − {breakdown.penalty}
          </p>
        )}
      </div>

      <div data-action-panel className="w-full">
        <button
          type="button"
          onClick={onAction}
          className="w-full rounded-[var(--radius-panel)] bg-signal py-3 font-sans text-sm font-medium text-signal-ink"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
