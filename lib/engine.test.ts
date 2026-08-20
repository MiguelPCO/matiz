import { describe, expect, it } from "vitest";
import { bestGuess, initialState, isRoundOver, reducer, scoreBreakdown, scoreRound, winner, winnerBreakdown } from "./engine";
import { buildGrid } from "./grid";
import type { GameState, GridSize, Round } from "./types";

// Celda cualquiera de la carta que NO sea el target — para provocar fallos
// deliberados sin depender de a qué celda cayó el target (seed-dependiente).
function offTargetCell(
  size: GridSize,
  target: { row: number; col: number },
): { row: number; col: number } {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (row !== target.row || col !== target.col) return { row, col };
    }
  }
  throw new Error("carta 1x1 — no hay celda fuera del target");
}

describe("engine.invariants — modo solo", () => {
  it("START_SOLO → SUBMIT_CLUE → pistas → fallo de acierto → NEXT sigue las transiciones de fase esperadas", () => {
    let s: GameState = reducer(initialState, {
      type: "START_SOLO",
      config: { size: 4, difficulty: "facil" },
    });
    expect(s.mode).toBe("solo");
    expect(s.phase).toBe("setup");
    expect(s.players).toHaveLength(1);

    s = reducer(s, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      seed: 42,
    });
    expect(s.phase).toBe("playing"); // solo: sin cortina
    expect(s.currentRound).toBe(0);
    const round = s.rounds[0]!;
    expect(round.setterId).toBeNull();
    expect(round.guesserId).toBe(s.players[0]!.id);

    const grid = buildGrid(round.gridSpec);
    const off = offTargetCell(4, grid.target);

    // pista 'light' ok
    const sHint1 = reducer(s, { type: "REQUEST_HINT", kind: "light" });
    expect(sHint1.rounds[0]!.hints).toHaveLength(1);

    // repetir el mismo tipo de pista es no-op (misma referencia de estado)
    const sHintDup = reducer(sHint1, { type: "REQUEST_HINT", kind: "light" });
    expect(sHintDup).toBe(sHint1);

    // pista 'dir' antes de cualquier tiro es no-op
    const sHintDirEarly = reducer(sHint1, { type: "REQUEST_HINT", kind: "dir" });
    expect(sHintDirEarly).toBe(sHint1);

    const sHint2 = reducer(sHint1, { type: "REQUEST_HINT", kind: "sat" });
    expect(sHint2.rounds[0]!.hints).toHaveLength(2);

    // tiro equivocado
    const sGuess1 = reducer(sHint2, { type: "GUESS", row: off.row, col: off.col });
    expect(sGuess1.rounds[0]!.guesses).toHaveLength(1);
    expect(sGuess1.phase).toBe("playing"); // aún quedan tiros
    expect(sGuess1.hasPlayed).toBe(false);

    // repetir la misma celda es no-op
    const sGuessDup = reducer(sGuess1, { type: "GUESS", row: off.row, col: off.col });
    expect(sGuessDup).toBe(sGuess1);

    // ahora 'dir' es válida (facil.maxHints = 3, hints.length = 2)
    const sHint3 = reducer(sGuess1, { type: "REQUEST_HINT", kind: "dir" });
    expect(sHint3.rounds[0]!.hints).toHaveLength(3);

    // cuarta pista: ya sin cupo (maxHints = 3) — no-op
    const sHintOver = reducer(sHint3, { type: "REQUEST_HINT", kind: "light" });
    expect(sHintOver).toBe(sHint3);

    // tiro al target: resuelve la ronda
    const sSolved = reducer(sHint3, {
      type: "GUESS",
      row: grid.target.row,
      col: grid.target.col,
    });
    const solvedRound = sSolved.rounds[0]!;
    expect(solvedRound.status).toBe("solved");
    expect(sSolved.phase).toBe("reveal");
    expect(sSolved.hasPlayed).toBe(true);
    expect(solvedRound.score).not.toBeNull();
    expect(solvedRound.score).toBe(scoreRound(solvedRound));
    expect(isRoundOver(solvedRound)).toBe(true);

    // GUESS/REQUEST_HINT tras reveal son no-op
    const sGuessAfterReveal = reducer(sSolved, { type: "GUESS", row: 0, col: 0 });
    expect(sGuessAfterReveal).toBe(sSolved);
    const sHintAfterReveal = reducer(sSolved, { type: "REQUEST_HINT", kind: "light" });
    expect(sHintAfterReveal).toBe(sSolved);

    // NEXT vuelve a setup, sin ronda en curso
    const sNext = reducer(sSolved, { type: "NEXT" });
    expect(sNext.phase).toBe("setup");
    expect(sNext.currentRound).toBeNull();
  });

  it("agota MAX_GUESSES sin acertar → status failed, phase reveal", () => {
    let s: GameState = reducer(initialState, {
      type: "START_SOLO",
      config: { size: 4, difficulty: "facil" },
    });
    s = reducer(s, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "arena", targetHex: "#d1c65f" },
      seed: 5,
    });
    const round = s.rounds[0]!;
    const grid = buildGrid(round.gridSpec);
    const wrongCells = Array.from({ length: 4 }, (_, i) => i)
      .map((i) => ({ row: (grid.target.row + 1 + i) % 4, col: (grid.target.col + 2 + i) % 4 }))
      .filter((c) => c.row !== grid.target.row || c.col !== grid.target.col)
      .slice(0, 3);
    expect(wrongCells).toHaveLength(3);

    for (const c of wrongCells) {
      s = reducer(s, { type: "GUESS", row: c.row, col: c.col });
    }

    const finalRound = s.rounds[0]!;
    expect(finalRound.guesses).toHaveLength(3);
    expect(finalRound.status).toBe("failed");
    expect(s.phase).toBe("reveal");
    expect(finalRound.score).not.toBeNull();
    expect(finalRound.score).toBeGreaterThanOrEqual(0);
    expect(bestGuess(finalRound)).not.toBeNull();
  });
});

describe("engine.invariants — modo duelo", () => {
  it("dos rondas completas siguen el traspaso de turno de PRD §4.8 / SCHEMA §7 y resuelven marcador + REMATCH", () => {
    let s: GameState = reducer(initialState, {
      type: "START_DUEL",
      names: ["Ana", "Beto"],
    });
    expect(s.players).toHaveLength(2);
    const ana = s.players[0]!;
    const beto = s.players[1]!;
    expect(s.activeIndex).toBe(0);

    s = reducer(s, { type: "SET_CONFIG", config: { size: 4, difficulty: "dificil" } });

    // Ronda 1: Ana pone la pista, Beto adivina.
    s = reducer(s, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "mar", targetHex: "#1f3a5f" },
      seed: 7,
    });
    const round1 = s.rounds[0]!;
    expect(round1.setterId).toBe(ana.id);
    expect(round1.guesserId).toBe(beto.id);
    expect(s.phase).toBe("curtain");
    expect(s.activeIndex).toBe(1); // el móvil pasa al adivinador

    s = reducer(s, { type: "UNLOCK_CURTAIN" });
    expect(s.phase).toBe("playing");

    const grid1 = buildGrid(round1.gridSpec);
    s = reducer(s, { type: "GUESS", row: grid1.target.row, col: grid1.target.col });
    expect(s.rounds[0]!.status).toBe("solved");
    expect(s.rounds[0]!.score).toBe(100); // sin pistas, un tiro: ring 0 = 100pts
    expect(s.phase).toBe("reveal");

    // NEXT tras ronda 1: Beto (quien acaba de adivinar) pasa a poner la
    // pista de la ronda 2 — Ana adivinará. Aún no hay marcador. Confirmado
    // por Miguel en Sprint 4: sin cortina intermedia — el mismo jugador
    // sigue con el móvil y pasa directo a definir la pista del rival.
    s = reducer(s, { type: "NEXT" });
    expect(s.phase).toBe("setup");
    expect(s.currentRound).toBeNull();
    expect(s.activeIndex).toBe(1); // Beto es el siguiente en poner pista

    // Ronda 2: Beto pone la pista, Ana adivina.
    s = reducer(s, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "brasa", targetHex: "#b6534f" },
      seed: 9,
    });
    const round2 = s.rounds[1]!;
    expect(round2.setterId).toBe(beto.id);
    expect(round2.guesserId).toBe(ana.id);
    expect(s.phase).toBe("curtain");
    expect(s.activeIndex).toBe(0); // el móvil pasa a Ana, la adivinadora

    s = reducer(s, { type: "UNLOCK_CURTAIN" });

    const grid2 = buildGrid(round2.gridSpec);
    const wrongCells = [0, 1, 2, 3]
      .map((i) => ({ row: (grid2.target.row + 1 + i) % 4, col: (grid2.target.col + 2 + i) % 4 }))
      .filter((c) => c.row !== grid2.target.row || c.col !== grid2.target.col)
      .slice(0, 3);
    for (const c of wrongCells) {
      s = reducer(s, { type: "GUESS", row: c.row, col: c.col });
    }
    expect(s.rounds[1]!.status).toBe("failed");
    // Ronda 2 falló → como mucho ring>=1 con penalización de tiros extra,
    // siempre por debajo de los 100pts limpios de la ronda 1.
    expect(s.rounds[1]!.score!).toBeLessThan(100);

    // NEXT tras las dos rondas: marcador.
    s = reducer(s, { type: "NEXT" });
    expect(s.phase).toBe("scoreboard");
    expect(s.currentRound).toBeNull();

    // Beto (guesserId de la ronda 1, score 100) gana por desempate de puntos.
    expect(winner(s)).toBe(beto.id);

    // REMATCH: el que puso la pista en la ronda 1 (Ana) no vuelve a arrancar
    // — le toca a Beto.
    const sRematch = reducer(s, { type: "REMATCH" });
    expect(sRematch.phase).toBe("setup");
    expect(sRematch.rounds).toHaveLength(0);
    expect(sRematch.currentRound).toBeNull();
    expect(sRematch.activeIndex).toBe(1);
  });
});

describe("engine.invariants — SET_CONFIG", () => {
  it("combina parcialmente sin pisar los campos no tocados", () => {
    let s = reducer(initialState, { type: "SET_CONFIG", config: { difficulty: "medio" } });
    expect(s.config).toEqual({ size: 4, difficulty: "medio" });
    s = reducer(s, { type: "SET_CONFIG", config: { size: 6 } });
    expect(s.config).toEqual({ size: 6, difficulty: "medio" });
  });

  it("NEXT y REMATCH conservan config — respalda «Otra ronda» de Sprint 2", () => {
    let s: GameState = reducer(initialState, {
      type: "START_SOLO",
      config: { size: 8, difficulty: "dificil" },
    });
    s = reducer(s, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "carbón", targetHex: "#2b2b2b" },
      seed: 13,
    });
    const grid = buildGrid(s.rounds[0]!.gridSpec);
    s = reducer(s, { type: "GUESS", row: grid.target.row, col: grid.target.col });
    expect(s.phase).toBe("reveal");

    s = reducer(s, { type: "NEXT" });
    expect(s.config).toEqual({ size: 8, difficulty: "dificil" });
    expect(s.phase).toBe("setup");
  });

  it("GO_HOME reinicia config al valor inicial pero conserva hasPlayed", () => {
    let s: GameState = reducer(initialState, {
      type: "START_SOLO",
      config: { size: 8, difficulty: "dificil" },
    });
    s = { ...s, hasPlayed: true };
    s = reducer(s, { type: "GO_HOME" });
    expect(s.config).toEqual({ size: 4, difficulty: "facil" });
    expect(s.hasPlayed).toBe(true);
  });
});

describe("engine.invariants — GO_HOME", () => {
  it("resetea todo el estado salvo hasPlayed", () => {
    let s: GameState = reducer(initialState, {
      type: "START_SOLO",
      config: { size: 4, difficulty: "facil" },
    });
    s = reducer(s, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      seed: 42,
    });
    const grid = buildGrid(s.rounds[0]!.gridSpec);
    s = reducer(s, { type: "GUESS", row: grid.target.row, col: grid.target.col });
    expect(s.hasPlayed).toBe(true);

    const home = reducer(s, { type: "GO_HOME" });
    expect(home).toEqual({ ...initialState, hasPlayed: true });
  });
});

describe("engine.serializable", () => {
  it("el estado sobrevive un ciclo JSON.stringify/parse sin pérdida, en solo y en duelo", () => {
    let solo: GameState = reducer(initialState, {
      type: "START_SOLO",
      config: { size: 5, difficulty: "medio" },
    });
    solo = reducer(solo, {
      type: "SUBMIT_CLUE",
      clue: { type: "word", word: "musgo", targetHex: "#3f8f5f" },
      seed: 11,
    });
    solo = reducer(solo, { type: "REQUEST_HINT", kind: "light" });
    const grid = buildGrid(solo.rounds[0]!.gridSpec);
    solo = reducer(solo, { type: "GUESS", row: grid.target.row, col: grid.target.col });

    expect(JSON.parse(JSON.stringify(solo))).toEqual(solo);

    let duel: GameState = reducer(initialState, {
      type: "START_DUEL",
      names: ["Ana", "Beto"],
    });
    duel = reducer(duel, {
      type: "SUBMIT_CLUE",
      clue: { type: "image", imageSrc: "data:image/png;base64,abc", targetHex: "#c7bfae" },
      seed: 3,
    });
    duel = reducer(duel, { type: "UNLOCK_CURTAIN" });

    expect(JSON.parse(JSON.stringify(duel))).toEqual(duel);
  });
});

describe("engine.invariants — scoreBreakdown", () => {
  it("ring 0 sin pistas ni tiros extra: base=100, penalty=0, total=100", () => {
    const round = {
      id: "r1",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [{ row: 0, col: 0, hex: "#4a72c9", ring: 0, closeness: 1 }],
      hints: [],
      status: "solved",
      score: null,
    } as const;
    expect(scoreBreakdown(round)).toEqual({ base: 100, penalty: 0, total: 100 });
  });

  it("ring 0 con 1 pista y 2 tiros extra: base=100, penalty=15+16=31, total=69", () => {
    const round = {
      id: "r2",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [
        { row: 1, col: 1, hex: "#000000", ring: 2, closeness: 0.2 },
        { row: 1, col: 2, hex: "#111111", ring: 1, closeness: 0.5 },
        { row: 0, col: 0, hex: "#4a72c9", ring: 0, closeness: 1 },
      ],
      hints: [{ kind: "light", text: "..." }],
      status: "solved",
      score: null,
    } as const;
    // base = ringPoints(0) = 100; penalty = 1*15 + (3-1)*8 = 15+16 = 31
    expect(scoreBreakdown(round)).toEqual({ base: 100, penalty: 31, total: 69 });
  });

  it("penalty nunca deja total negativo (clamp a 0)", () => {
    const round = {
      id: "r3",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [{ row: 1, col: 1, hex: "#000000", ring: 3, closeness: 0.1 }],
      hints: [
        { kind: "light", text: "..." },
        { kind: "sat", text: "..." },
      ],
      status: "failed",
      score: null,
    } as const;
    // base = ringPoints(3) = 12; penalty = 2*15 + 0 = 30 → total clamped to 0
    expect(scoreBreakdown(round)).toEqual({ base: 12, penalty: 30, total: 0 });
  });

  it("scoreRound sigue devolviendo el mismo total que scoreBreakdown", () => {
    const round = {
      id: "r4",
      guesserId: "p1",
      setterId: null,
      clue: { type: "word", word: "cielo", targetHex: "#4a72c9" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#4a72c9" },
      guesses: [{ row: 0, col: 0, hex: "#4a72c9", ring: 0, closeness: 1 }],
      hints: [],
      status: "solved",
      score: null,
    } as const;
    expect(scoreRound(round)).toBe(scoreBreakdown(round).total);
  });
});

describe("engine.invariants — winnerBreakdown", () => {
  const p1 = "p1";
  const p2 = "p2";

  function stateWith(rounds: readonly Round[]): GameState {
    return {
      mode: "duel",
      phase: "scoreboard",
      players: [
        { id: p1, name: "Ana", accent: "signal" },
        { id: p2, name: "Beto", accent: "muted" },
      ],
      activeIndex: 0,
      config: { size: 4, difficulty: "facil" },
      rounds,
      currentRound: null,
      hasPlayed: true,
    };
  }

  function round(overrides: Partial<Round> & { guesserId: string }): Round {
    return {
      id: "r",
      setterId: null,
      clue: { type: "word", word: "x", targetHex: "#000000" },
      gridSpec: { seed: 1, size: 4, difficulty: "facil", targetHex: "#000000" },
      guesses: [],
      hints: [],
      status: "solved",
      score: 0,
      ...overrides,
    };
  }

  it("decide por puntuación cuando difieren", () => {
    const s = stateWith([
      round({ guesserId: p1, score: 100 }),
      round({ guesserId: p2, score: 60 }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p1, stage: "score" });
  });

  it("empate en puntos, decide por menos pistas", () => {
    const s = stateWith([
      round({ guesserId: p1, score: 60, hints: [{ kind: "light", text: "" }] }),
      round({ guesserId: p2, score: 60, hints: [] }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p2, stage: "hints" });
  });

  it("empate en puntos y pistas, decide por menos tiros", () => {
    const s = stateWith([
      round({
        guesserId: p1,
        score: 60,
        guesses: [
          { row: 0, col: 0, hex: "#000", ring: 2, closeness: 0.3 },
          { row: 0, col: 1, hex: "#000", ring: 0, closeness: 1 },
        ],
      }),
      round({
        guesserId: p2,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 0, closeness: 1 }],
      }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p2, stage: "guesses" });
  });

  it("empate en puntos/pistas/tiros, decide por closeness del mejor tiro", () => {
    const s = stateWith([
      round({
        guesserId: p1,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 1, closeness: 0.7 }],
      }),
      round({
        guesserId: p2,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 1, closeness: 0.9 }],
      }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: p2, stage: "closeness" });
  });

  it("empate total en las cuatro etapas → tie, sin ganador", () => {
    const s = stateWith([
      round({
        guesserId: p1,
        score: 60,
        guesses: [{ row: 0, col: 0, hex: "#000", ring: 1, closeness: 0.7 }],
      }),
      round({
        guesserId: p2,
        score: 60,
        guesses: [{ row: 1, col: 1, hex: "#111", ring: 1, closeness: 0.7 }],
      }),
    ]);
    expect(winnerBreakdown(s)).toEqual({ winnerId: null, stage: "tie" });
  });
});
