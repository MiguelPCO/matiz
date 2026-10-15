#!/usr/bin/env bash
# Drive MATIZ for verification. Run from anywhere: bash .claude/skills/verify/matiz-verify.sh <cmd>
#   up            start `next dev` on $PORT (default 4000), wait until usable
#   doctor        read-only health check of the instance this script started
#   ab <args...>  agent-browser in the isolated session "matiz-verify"
#   shot <name>   screenshot to .verify/artifacts/<name>.png (dirs created)
#   down          close browser session, kill the server we started; keeps artifacts
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${PORT:-4000}"
URL="http://localhost:$PORT"
RUN="$ROOT/.verify/run"
ART="$ROOT/.verify/artifacts"
SESSION="matiz-verify"

listener() { netstat -ano | awk -v p=":$PORT" '$2 ~ p"$" && $4=="LISTENING" {print $5; exit}'; }

case "${1:-}" in
up)
  if [ -n "$(listener)" ]; then
    echo "port $PORT already held by PID $(listener); not ours, refusing (run doctor or pick PORT=)" >&2; exit 1
  fi
  mkdir -p "$RUN" "$ART"
  (cd "$ROOT" && nohup node node_modules/next/dist/bin/next dev --turbopack -p "$PORT" > "$RUN/dev.log" 2>&1 &)
  for _ in $(seq 1 60); do
    if grep -q "Ready in" "$RUN/dev.log" 2>/dev/null && curl -sf -o /dev/null "$URL/"; then
      listener > "$RUN/server.pid"; echo "ready $URL pid $(cat "$RUN/server.pid")"; exit 0
    fi
    sleep 2
  done
  echo "not ready after 120s; see $RUN/dev.log" >&2; exit 1 ;;
doctor)
  ok=1
  want="$(cat "$RUN/server.pid" 2>/dev/null || true)"; have="$(listener)"
  [ -n "$want" ] && [ "$want" = "$have" ] && echo "ok   port $PORT owned by our PID $have" || { echo "FAIL port $PORT: listener '$have', ours '$want'"; ok=0; }
  curl -s "$URL/" | grep -q "MATIZ" && echo "ok   GET / renders MATIZ" || { echo "FAIL GET / missing MATIZ"; ok=0; }
  body="$(curl -s -X POST "$URL/api/word-color" -H 'content-type: application/json' -d '{}')"
  [ "$body" = '{"error":"invalid"}' ] && echo "ok   /api/word-color validates input (no Claude call)" || { echo "FAIL /api/word-color -> $body"; ok=0; }
  grep -q "\.env\.local" "$RUN/dev.log" && echo "ok   .env.local loaded" || { echo "FAIL .env.local not loaded (word clues will fail)"; ok=0; }
  [ $ok = 1 ] ;;
ab)
  shift; exec agent-browser --session "$SESSION" "$@" ;;
shot)
  f="$ART/$2.png"; mkdir -p "$(dirname "$f")"
  agent-browser --session "$SESSION" screenshot "$f" ;;
down)
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  pid="$(cat "$RUN/server.pid" 2>/dev/null || true)"
  if [ -n "$pid" ]; then taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; fi
  rm -rf "$RUN"
  echo "down; evidence kept in $ART" ;;
*)
  sed -n 2,7p "$0"; exit 2 ;;
esac
