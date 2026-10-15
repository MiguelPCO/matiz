# Clue APIs

Two public server routes back the clues: word → color for Solo/Duelo word clues, color → word for the Diario label. Both call Claude server-side, never expose the key, validate input, and rate-limit per IP.

## Sub-features

- `api-word-color` `POST /api/word-color {"word": "<text>"}` → `{"hex":"#rrggbb"}`.
- `api-color-word` `POST /api/color-word` → a Spanish word for a hex (used by Diario).
- `api-invalid` bad or missing input → `400 {"error":"invalid"}`.
- `api-rate-limit` more than 20 requests/min from one IP → `429 {"error":"rate_limited"}`.

## How to get to it (user POV)

- Indirectly: Solo `Empezar`, Duelo `Revelar color`, Diario page load.
- Directly with `curl` against the running instance.

## Driving it with curl

Preconditions:

- Baseline from the index (`doctor` already proves `api-invalid` on word-color).

- **Word to color.** Run `curl -s -X POST localhost:4000/api/word-color -H 'content-type: application/json' -d '{"word":"óxido"}' | tee .verify/artifacts/clue-apis/word-color.json`. Output matches `{"hex":"#xxxxxx"}` with a rust-like hue.
- **Invalid.** Run `curl -s -w ' %{http_code}' -X POST localhost:4000/api/word-color -H 'content-type: application/json' -d '{"word":""}'`. Output is `{"error":"invalid"} 400`.
- **Color to word.** Read the request body shape in `lib/color-word.ts` first, then `curl` it the same way and save to `.verify/artifacts/clue-apis/color-word.json`. Output is JSON with a word.
- **UI path.** The same routes are proven through the UI in [Solo round](./solo-round.md) and [Diario](./diario.md); a curl pass alone does not verify those screens.

## Gotchas

- Every success costs a Claude Haiku call. Do not loop to test the rate limit against the real key; `lib/rate-limit.test.ts` covers the counter, and a live 429 check needs 21 calls.
- The limiter is in-process memory: restarting the dev server resets it.
- On Windows Git Bash, non-ASCII in `-d` is sent as UTF-8; if the route returns `invalid` for `óxido`, retry with an ASCII word to separate encoding from route bugs.
