"use client";

import { createContext, createElement, useContext, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import { initialState, reducer } from "../lib/engine";
import type { GameAction, GameState } from "../lib/types";

/**
 * useReducer + contexto sobre el motor puro de lib/engine.ts (SCHEMA §8).
 * .ts (no .tsx): el Provider se arma con createElement para no requerir JSX,
 * conservando el nombre de archivo fijado en la estructura de directorios.
 */

interface GameContextValue {
  readonly state: GameState;
  readonly dispatch: Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return createElement(GameContext.Provider, { value: { state, dispatch } }, children);
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame debe usarse dentro de <GameProvider>");
  return ctx;
}
