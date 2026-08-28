"use client";

import { useEffect, useMemo, useState } from "react";
import { computeDailyStats } from "../../lib/daily";
import type { DailyHistory } from "../../lib/daily";
import { Label } from "../ui/Label";

interface DailyStatsProps {
  readonly history: DailyHistory;
  readonly todayKey: string;
}

/**
 * Panel de estadísticas estilo Wordle, mostrado tras acabar la partida de
 * hoy en Diario (ver decisión con Miguel, 2026-08-28). Racha/mejor
 * racha/% victorias vienen de lib/daily.ts (computeDailyStats, con tests);
 * el calendario y la cuenta atrás son puramente de presentación, sin lógica
 * de juego que testear por separado (SCHEMA §11).
 */

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;
const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function msUntilNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function useCountdownToNextDaily(): string {
  const [remainingMs, setRemainingMs] = useState(msUntilNextLocalMidnight);
  useEffect(() => {
    const id = setInterval(() => setRemainingMs(msUntilNextLocalMidnight()), 1000);
    return () => clearInterval(id);
  }, []);
  return formatCountdown(remainingMs);
}

type DayStatus = "solved" | "failed" | "none" | "future";

function statusFor(history: DailyHistory, dateKey: string, todayKey: string): DayStatus {
  const entry = history[dateKey];
  if (entry) return entry.status;
  return dateKey > todayKey ? "future" : "none";
}

const DAY_CELL_CLASS: Record<DayStatus, string> = {
  solved: "bg-signal text-signal-ink",
  failed: "border border-line bg-surface-2 text-text-muted",
  none: "bg-surface-1 text-text-faint",
  future: "text-text-faint opacity-30",
};

export function DailyStats({ history, todayKey }: DailyStatsProps) {
  const stats = useMemo(() => computeDailyStats(history, todayKey), [history, todayKey]);
  const countdown = useCountdownToNextDaily();

  const [todayYear, todayMonth] = todayKey.split("-").map(Number) as [number, number];
  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth - 1); // 0-11

  const isCurrentMonth = viewYear === todayYear && viewMonth === todayMonth - 1;

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (isCurrentMonth) return;
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // getDay(): 0=domingo..6=sábado — se rota a semana que empieza en lunes.
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const cells: { readonly day: number; readonly dateKey: string; readonly status: DayStatus }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    cells.push({ day, dateKey, status: statusFor(history, dateKey, todayKey) });
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-[var(--radius-panel)] bg-surface-1 p-2 text-center">
          <p className="font-mono text-xl font-bold text-text">{stats.currentStreak}</p>
          <Label className="mt-0.5 block">Racha</Label>
        </div>
        <div className="rounded-[var(--radius-panel)] bg-surface-1 p-2 text-center">
          <p className="font-mono text-xl font-bold text-text">{stats.bestStreak}</p>
          <Label className="mt-0.5 block">Mejor</Label>
        </div>
        <div className="rounded-[var(--radius-panel)] bg-surface-1 p-2 text-center">
          <p className="font-mono text-xl font-bold text-text">{stats.winPercent}%</p>
          <Label className="mt-0.5 block">Victorias</Label>
        </div>
        <div className="rounded-[var(--radius-panel)] bg-surface-1 p-2 text-center">
          <p className="font-mono text-xl font-bold text-text">{stats.gamesPlayed}</p>
          <Label className="mt-0.5 block">Partidas</Label>
        </div>
      </div>

      <div className="rounded-[var(--radius-panel)] bg-surface-1 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="Mes anterior"
            className="font-mono text-sm text-text-muted"
          >
            ‹
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            aria-label="Mes siguiente"
            className="font-mono text-sm text-text-muted disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="text-center font-mono text-[10px] text-text-faint">
              {label}
            </span>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {cells.map(({ day, dateKey, status }) => (
            <span
              key={dateKey}
              title={dateKey}
              className={`flex aspect-square items-center justify-center rounded-full font-mono text-[11px] ${DAY_CELL_CLASS[status]} ${
                dateKey === todayKey ? "ring-1 ring-signal" : ""
              }`}
            >
              {day}
            </span>
          ))}
        </div>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
        Próximo Diario en {countdown}
      </p>
    </div>
  );
}
