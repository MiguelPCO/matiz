"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface HoldToConfirmProps {
  readonly durationMs?: number;
  readonly label: string;
  readonly onConfirm: () => void;
}

const DEFAULT_DURATION_MS = 1200;
const TICK_COUNT = 12;

/**
 * Anillo de progreso hecho de 12 marcas SVG que se iluminan en secuencia
 * (opacity 0.25→1, GSAP stagger) mientras se mantiene pulsado — nunca
 * stroke-dashoffset (SCHEMA §8.3). No se gatea por prefers-reduced-motion:
 * es feedback funcional de un gesto cronometrado, no decoración.
 */
function tickLine(i: number) {
  const angle = (i * 360) / TICK_COUNT - 90; // 0 → 12 en punto, avanza en sentido horario
  const rad = (angle * Math.PI) / 180;
  const innerR = 34;
  const outerR = 46;
  return {
    x1: 50 + innerR * Math.cos(rad),
    y1: 50 + innerR * Math.sin(rad),
    x2: 50 + outerR * Math.cos(rad),
    y2: 50 + outerR * Math.sin(rad),
  };
}

export function HoldToConfirm({
  durationMs = DEFAULT_DURATION_MS,
  label,
  onConfirm,
}: HoldToConfirmProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const { contextSafe } = useGSAP(() => {}, { scope: containerRef });

  const start = contextSafe((e?: React.PointerEvent) => {
    if (e && (!e.isPrimary || e.button !== 0)) return;
    if (tweenRef.current) return;
    const ticks = svgRef.current?.querySelectorAll<SVGLineElement>("[data-tick]");
    if (!ticks || ticks.length === 0) return;
    tweenRef.current = gsap.to(ticks, {
      opacity: 1,
      duration: durationMs / 1000 / TICK_COUNT,
      ease: "none",
      stagger: durationMs / 1000 / TICK_COUNT,
      onComplete: () => {
        tweenRef.current = null;
        onConfirm();
      },
    });
  });

  const cancel = contextSafe(() => {
    if (!tweenRef.current) return;
    tweenRef.current.kill();
    tweenRef.current = null;
    const ticks = svgRef.current?.querySelectorAll<SVGLineElement>("[data-tick]");
    if (ticks) gsap.set(ticks, { opacity: 0.25 });
  });

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (e.repeat) return;
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") cancel();
      }}
      onBlur={cancel}
      className="relative flex h-28 w-28 select-none flex-col items-center justify-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
    >
      <svg ref={svgRef} viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const { x1, y1, x2, y2 } = tickLine(i);
          return (
            <line
              key={i}
              data-tick
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-signal opacity-25"
            />
          );
        })}
      </svg>
      <span className="relative px-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {label}
      </span>
    </div>
  );
}
