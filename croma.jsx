import { useState, useRef, useEffect } from "react";

/* ------------------------------------------------------------------ */
/* Color math — sRGB <-> OKLab <-> OKLCH (Björn Ottosson).            */
/* OKLCH es el formato canónico; toda la lógica es portable 1:1 a la  */
/* migración Next.js (irá a lib/color.ts).                            */
/* ------------------------------------------------------------------ */
const sRGBtoLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const linTosRGB = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); };

function rgbToOklab(r, g, b) {
  const lr = sRGBtoLin(r), lg = sRGBtoLin(g), lb = sRGBtoLin(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}
function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return {
    r: linTosRGB(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linTosRGB(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linTosRGB(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  };
}
const oklabToOklch = (L, a, b) => { let H = Math.atan2(b, a) * 180 / Math.PI; if (H < 0) H += 360; return { L, C: Math.hypot(a, b), H }; };
const oklchToRgb = (L, C, H) => { const h = H * Math.PI / 180; return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h)); };
const toHex = (r, g, b) => "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
function hexToRgb(hex) { hex = hex.replace("#", ""); if (hex.length === 3) hex = hex.split("").map((c) => c + c).join(""); const n = parseInt(hex, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
const hexToOklab = (hex) => { const { r, g, b } = hexToRgb(hex); return rgbToOklab(r, g, b); };
const hexToOklch = (hex) => { const o = hexToOklab(hex); return oklabToOklch(o.L, o.a, o.b); };
/* ΔE perceptual: distancia euclídea en OKLab. */
function deltaE(h1, h2) { const a = hexToOklab(h1), b = hexToOklab(h2); return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b); }

/* ------------------------------------------------------------------ */
/* Campo ordenado: tono en X, luminosidad en Y, alrededor del target. */
/* Suelo de paso (ΔE mínimo entre vecinos) para que "Difícil" sea     */
/* difícil de DECIDIR, no imposible de VER.                           */
/* ------------------------------------------------------------------ */
function buildGrid(targetHex, size, spread) {
  const { L, C, H } = hexToOklch(targetHex);   // tono H fijo: la carta son tonalidades del MISMO color
  const tr = Math.floor(Math.random() * size);
  const tc = Math.floor(Math.random() * size);
  const lStep = Math.max(spread.l / (size - 1), 0.045);  // suelo de decidibilidad en luminosidad
  const cStep = Math.max(spread.c / (size - 1), 0.014);  // ... y en croma
  const cells = [];
  for (let row = 0; row < size; row++) {
    const line = [];
    for (let col = 0; col < size; col++) {
      const Lc = Math.max(0.18, Math.min(0.95, L + (col - tc) * lStep));  // izq oscuro -> der claro
      const Cc = Math.max(0.01, Math.min(0.37, C + (tr - row) * cStep));  // arriba vivo -> abajo apagado
      const { r, g, b } = oklchToRgb(Lc, Cc, H);
      line.push({ row, col, hex: toHex(r, g, b) });
    }
    cells.push(line);
  }
  cells[tr][tc].hex = targetHex;
  const dEmax = Math.max(...cells.flat().map((c) => deltaE(c.hex, targetHex))) || 1;
  return { size, cells, target: { row: tr, col: tc }, dEmax };
}

function extractColor(imgEl) {
  const c = document.createElement("canvas");
  const w = 60, h = 60; c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(imgEl, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let R = 0, G = 0, B = 0, W = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 125) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const wgt = 1 + (Math.max(r, g, b) - Math.min(r, g, b)) / 60;
    R += sRGBtoLin(r) * wgt; G += sRGBtoLin(g) * wgt; B += sRGBtoLin(b) * wgt; W += wgt;
  }
  return toHex(linTosRGB(R / W), linTosRGB(G / W), linTosRGB(B / W));
}

async function wordToColor(word) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: `Eres experto en color. Para el concepto "${word}", da el color más prototípico y reconocible: el del objeto o material real, el que la mayoría imaginaría (p. ej. "helado de vainilla" = crema, "óxido" = herrumbre). Responde ÚNICAMENTE con un hex #rrggbb, nada más.` }],
    }),
  });
  const data = await res.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/#([0-9a-fA-F]{6})/);
  if (!m) throw new Error("sin color");
  return "#" + m[1];
}

/* ------------------------------------------------------------------ */
/* Config                                                             */
/* ------------------------------------------------------------------ */
const DIFF = {
  facil: { label: "Fácil", spread: { l: 0.62, c: 0.20 }, hints: 3 },
  medio: { label: "Medio", spread: { l: 0.42, c: 0.13 }, hints: 2 },
  dificil: { label: "Difícil", spread: { l: 0.26, c: 0.08 }, hints: 1 },
};
const MAX_GUESSES = 3;
const chebyshev = (a, b) => Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
const ringPoints = (d) => (d === 0 ? 100 : d === 1 ? 60 : d === 2 ? 30 : d === 3 ? 12 : 0);

/* Termómetro: cuán cerca en color, normalizado al ΔE máximo del tablero. */
function thermo(clo) {
  if (clo >= 0.965) return { t: "¡Ahí es!", pct: 100 };
  if (clo >= 0.82) return { t: "Casi", pct: 90 };
  if (clo >= 0.55) return { t: "Cerca", pct: 72 };
  if (clo >= 0.3) return { t: "Templado", pct: 46 };
  return { t: "Lejos", pct: Math.max(10, clo * 45) };
}
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { } }

/* Tokens — laboratorio de calibración: entorno neutro para leer color sin sesgo. */
const T = {
  bg: "#181A1E", panel: "#212429", raised: "#2A2E34", line: "#3A3F47",
  text: "#ECEEF1", muted: "#98A0AB", faint: "#666D77", signal: "#E7A34B",
};

export default function App() {
  const [screen, setScreen] = useState("setup");
  const [inputType, setInputType] = useState("word");
  const [size, setSize] = useState(6);
  const [difficulty, setDifficulty] = useState("medio");
  const [word, setWord] = useState("");
  const [imgSrc, setImgSrc] = useState(null);
  const imgHex = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [round, setRound] = useState(null);
  const [guesses, setGuesses] = useState([]);
  const [hints, setHints] = useState([]);
  const [finished, setFinished] = useState(false);
  const [shownScore, setShownScore] = useState(0);

  const cfg = DIFF[difficulty];

  function onFile(e) {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const src = rd.result;
      const im = new Image();
      im.onload = () => { imgHex.current = extractColor(im); setImgSrc(src); setError(null); };
      im.src = src;
    };
    rd.readAsDataURL(f);
  }

  async function start() {
    setError(null);
    let hex, clue;
    if (inputType === "word") {
      if (!word.trim()) { setError("Escribe una palabra para empezar."); return; }
      setLoading(true);
      try { hex = await wordToColor(word.trim()); }
      catch { setError("No se pudo obtener el color. Inténtalo otra vez."); setLoading(false); return; }
      setLoading(false);
      clue = { type: "word", word: word.trim() };
    } else {
      if (!imgSrc || !imgHex.current) { setError("Sube una imagen para empezar."); return; }
      hex = imgHex.current;
      clue = { type: "image", imgSrc };
    }
    const grid = buildGrid(hex, size, cfg.spread);
    setRound({ clue, targetHex: hex, grid, tOklch: hexToOklch(hex) });
    setGuesses([]); setHints([]); setFinished(false); setShownScore(0);
    setScreen("play");
  }

  function guess(cell) {
    if (finished || guesses.some((x) => x.row === cell.row && x.col === cell.col)) return;
    const ring = chebyshev(cell, round.grid.target);
    const clo = Math.max(0, Math.min(1, 1 - deltaE(cell.hex, round.targetHex) / round.grid.dEmax));
    const next = [...guesses, { ...cell, ring, clo }];
    setGuesses(next);
    buzz(ring === 0 ? [18, 40, 18] : 9);
    if (ring === 0 || next.length >= MAX_GUESSES) setFinished(true);
  }

  function addHint(kind) {
    if (finished || hints.length >= cfg.hints || hints.some((h) => h.kind === kind)) return;
    const t = round.grid.target, n = size - 1 || 1;
    let text;
    if (kind === "light") {          // eje X: oscuro -> claro
      const r = t.col / n;
      text = r < 0.34 ? "Oscuro" : r < 0.67 ? "Medio" : "Claro";
    } else if (kind === "sat") {     // eje Y: vivo (arriba) -> apagado (abajo)
      const r = (n - t.row) / n;
      text = r < 0.34 ? "Apagado" : r < 0.67 ? "Medio" : "Vivo";
    } else {                          // dirección relativa al último tiro
      const last = guesses[guesses.length - 1];
      if (!last) return;
      const v = t.row < last.row ? "arriba" : t.row > last.row ? "abajo" : null;
      const h = t.col < last.col ? "izquierda" : t.col > last.col ? "derecha" : null;
      const arrows = { "arriba-izquierda": "↖", "arriba-derecha": "↗", "abajo-izquierda": "↙", "abajo-derecha": "↘", "arriba": "↑", "abajo": "↓", "izquierda": "←", "derecha": "→" };
      const key = [v, h].filter(Boolean).join("-");
      text = key ? `${key.replace("-", " · ")} ${arrows[key]}` : "aquí mismo";
    }
    setHints([...hints, { kind, text }]);
    buzz(6);
  }

  const best = guesses.length ? Math.min(...guesses.map((g) => g.ring)) : 99;
  const bestGuess = guesses.length ? guesses.reduce((a, b) => (b.ring < a.ring ? b : a)) : null;
  const solved = best === 0;
  const base = finished ? ringPoints(best) : 0;
  const penalty = hints.length * 15 + Math.max(0, guesses.length - 1) * 8;
  const score = Math.max(0, base - penalty);
  const last = guesses[guesses.length - 1];

  /* Conteo animado del score al revelar. */
  useEffect(() => {
    if (!finished) return;
    let raf, t0;
    const tick = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / 700); setShownScore(Math.round(score * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finished, score]);

  const btn = (active) => ({ borderColor: active ? T.signal : T.line, background: active ? "rgba(231,163,75,0.12)" : "transparent", color: active ? T.text : T.muted });
  const center = (c) => ({ x: ((c.col + 0.5) / size) * 100, y: ((c.row + 0.5) / size) * 100 });

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: "100vh" }} className="w-full flex justify-center px-4 py-8">
      <div className="w-full" style={{ maxWidth: 440 }}>

        <header className="mb-6">
          <div style={{ color: T.faint }} className="font-mono text-[10px] tracking-[0.35em] uppercase mb-1">prueba de color a ciegas</div>
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-semibold tracking-tight">CROMA</h1>
            <span style={{ color: T.faint }} className="font-mono text-[11px]">OKLCH · N-{size}</span>
          </div>
        </header>

        {screen === "setup" && (
          <div style={{ background: T.panel, borderColor: T.line }} className="border rounded-xl p-5">
            <Label>Pista</Label>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {["word", "image"].map((k) => (
                <button key={k} onClick={() => { setInputType(k); setError(null); }} style={btn(inputType === k)}
                  className="border rounded-lg py-2 text-sm transition-colors motion-reduce:transition-none">
                  {k === "word" ? "Palabra" : "Imagen"}
                </button>
              ))}
            </div>

            {inputType === "word" ? (
              <input value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()}
                placeholder="ej. helado de vainilla, océano, óxido…"
                style={{ background: T.raised, borderColor: T.line, color: T.text }}
                className="w-full border rounded-lg px-3 py-2.5 text-sm mb-5 outline-none focus:border-white/40" />
            ) : (
              <div style={{ background: T.raised, borderColor: T.line }} className="relative flex flex-col items-center justify-center border border-dashed rounded-lg py-6 mb-5 text-sm">
                {imgSrc
                  ? <img src={imgSrc} alt="pista" className="h-20 w-20 object-cover rounded" style={{ filter: "grayscale(1)" }} />
                  : <span style={{ color: T.muted }}>Toca para subir una foto</span>}
                <input type="file" accept="image/*" onChange={onFile}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Subir imagen" />
              </div>
            )}

            <Label>Tamaño de la carta</Label>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[4, 5, 6, 8].map((n) => (
                <button key={n} onClick={() => setSize(n)} style={btn(size === n)}
                  className="border rounded-lg py-2 text-sm font-mono transition-colors motion-reduce:transition-none">{n}×{n}</button>
              ))}
            </div>

            <Label>Dificultad</Label>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {Object.entries(DIFF).map(([k, d]) => (
                <button key={k} onClick={() => setDifficulty(k)} style={btn(difficulty === k)}
                  className="border rounded-lg py-2 text-sm transition-colors motion-reduce:transition-none">{d.label}</button>
              ))}
            </div>

            {error && <p style={{ color: T.signal }} className="text-xs mb-3">{error}</p>}

            <button onClick={start} disabled={loading} style={{ background: T.signal, color: "#1b1205" }}
              className="w-full rounded-lg py-3 text-sm font-semibold tracking-wide disabled:opacity-60 active:scale-[0.99] transition-transform motion-reduce:transition-none">
              {loading ? "Revelando color…" : "Empezar"}
            </button>
            <p style={{ color: T.faint }} className="font-mono text-[10px] mt-3 leading-relaxed">
              {MAX_GUESSES} intentos · {cfg.hints} pista{cfg.hints > 1 ? "s" : ""} · el gris del entorno es a propósito, para leer color sin sesgo.
            </p>
          </div>
        )}

        {screen === "play" && round && (
          <div>
            <div style={{ background: T.panel, borderColor: T.line }} className="border rounded-xl p-4 mb-3 flex items-center gap-4">
              {round.clue.type === "image" ? (
                <img src={round.clue.imgSrc} alt="pista"
                  style={{ filter: finished ? "grayscale(0)" : "grayscale(1) contrast(1.05)", transition: "filter .9s ease" }}
                  className="h-16 w-16 object-cover rounded-lg motion-reduce:transition-none" />
              ) : (
                <div style={{ background: T.raised, color: T.text }} className="h-16 px-4 flex items-center rounded-lg text-lg font-medium">{round.clue.word}</div>
              )}
              <div className="min-w-0">
                <div style={{ color: T.faint }} className="font-mono text-[10px] tracking-widest uppercase">pista</div>
                <div style={{ color: T.muted }} className="text-xs">{round.clue.type === "image" ? "¿Qué color domina esta foto?" : "¿Qué color evoca?"}</div>
              </div>
            </div>

            {/* Carta de color + línea de reveal */}
            <div style={{ background: T.raised, borderColor: T.line }} className="border rounded-xl p-3 mb-3">
              <div className="relative">
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
                  {round.grid.cells.flat().map((cell) => {
                    const g = guesses.find((x) => x.row === cell.row && x.col === cell.col);
                    const isTarget = finished && cell.row === round.grid.target.row && cell.col === round.grid.target.col;
                    return (
                      <button key={`${cell.row}-${cell.col}`} onClick={() => guess(cell)} disabled={finished}
                        aria-label={`Fila ${cell.row + 1}, columna ${cell.col + 1}`}
                        className="relative rounded transition-transform duration-150 motion-reduce:transition-none focus:outline-none focus:ring-2 focus:ring-white/70 active:scale-90"
                        style={{
                          aspectRatio: "1 / 1", background: cell.hex, cursor: finished ? "default" : "pointer",
                          boxShadow: isTarget ? `0 0 0 2px ${T.signal}, 0 0 0 4px ${T.raised}` : g ? "0 0 0 2px rgba(255,255,255,0.9)" : "none",
                          transform: g && !isTarget ? "scale(0.88)" : undefined,
                        }}>
                        {isTarget && <span className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "#1b1205" }}>◎</span>}
                      </button>
                    );
                  })}
                </div>
                {finished && bestGuess && !solved && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                    <line x1={center(bestGuess).x} y1={center(bestGuess).y} x2={center(round.grid.target).x} y2={center(round.grid.target).y}
                      stroke={T.signal} strokeWidth="0.8" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                    <circle cx={center(bestGuess).x} cy={center(bestGuess).y} r="1.4" fill={T.signal} />
                  </svg>
                )}
              </div>
              <div style={{ color: T.faint }} className="font-mono text-[9px] mt-2 text-center leading-relaxed">columnas oscuro→claro · filas vivo→apagado<br/>exacto 100 · a1 60 · a2 30 · a3 12</div>
            </div>

            {!finished ? (
              <div style={{ background: T.panel, borderColor: T.line }} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span style={{ color: T.muted }} className="text-xs">Intentos <span className="font-mono" style={{ color: T.text }}>{MAX_GUESSES - guesses.length}</span></span>
                  <span style={{ color: T.muted }} className="text-xs">Pistas <span className="font-mono" style={{ color: T.text }}>{cfg.hints - hints.length}</span></span>
                </div>

                {/* Termómetro del último tiro */}
                <div className="mb-4">
                  {last ? (() => { const th = thermo(last.clo); return (
                    <>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-sm font-medium" style={{ color: T.signal }}>{th.t}</span>
                        <span className="font-mono text-[10px]" style={{ color: T.faint }}>tiro {guesses.length}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: T.raised }}>
                        <div className="h-full rounded-full transition-all duration-500 motion-reduce:transition-none" style={{ width: `${th.pct}%`, background: `linear-gradient(90deg, ${T.line}, ${T.signal})` }} />
                      </div>
                    </>
                  ); })() : (
                    <div style={{ color: T.faint }} className="text-xs">Toca una celda. El termómetro te dirá cuán cerca en color, no hacia dónde.</div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[["light", "Claridad"], ["sat", "Intensidad"], ["dir", "Dirección"]].map(([k, l]) => {
                    const used = hints.some((h) => h.kind === k);
                    const needGuess = k === "dir" && guesses.length === 0;
                    const disabled = used || hints.length >= cfg.hints || needGuess;
                    return (
                      <button key={k} onClick={() => addHint(k)} disabled={disabled}
                        style={{ borderColor: T.line, color: disabled ? T.faint : T.muted }}
                        className="border rounded-lg py-2 text-xs transition-colors motion-reduce:transition-none disabled:opacity-50">
                        {used ? hints.find((h) => h.kind === k).text : needGuess ? "tras 1er tiro" : l}
                      </button>
                    );
                  })}
                </div>
                {hints.length > 0 && <p style={{ color: T.faint }} className="font-mono text-[10px] mt-3">cada pista −15 · intento extra −8</p>}
              </div>
            ) : (
              <div style={{ background: T.panel, borderColor: solved ? T.signal : T.line }} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-lg font-semibold">{solved ? "Acertado" : best <= 2 ? "Cerca" : "Sin acertar"}</div>
                    <div style={{ color: T.muted }} className="text-xs">Mejor tiro a {best === 99 ? "—" : best} de distancia</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-3xl font-bold" style={{ color: T.signal }}>{shownScore}</div>
                    <div style={{ color: T.faint }} className="font-mono text-[10px]">{base} − {penalty}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded" style={{ background: round.targetHex, boxShadow: `0 0 0 1px ${T.line}` }} />
                  <div className="font-mono text-xs" style={{ color: T.muted }}>color real <span style={{ color: T.text }}>{round.targetHex.toUpperCase()}</span></div>
                </div>
                <button onClick={() => setScreen("setup")} style={{ borderColor: T.line, color: T.text }}
                  className="w-full border rounded-lg py-2.5 text-sm transition-colors motion-reduce:transition-none active:scale-[0.99]">Otra ronda</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ color: "#666D77" }} className="font-mono text-[10px] tracking-[0.25em] uppercase mb-2">{children}</div>;
}
