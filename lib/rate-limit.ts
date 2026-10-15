/**
 * Límite de peticiones para las rutas que llaman a Claude (app/api/*),
 * que son públicas y cuestan dinero por llamada.
 *
 * ponytail: ventana en memoria del proceso. En Vercel cada instancia
 * lleva su propio contador, así que el techo real es LIMIT × instancias
 * activas — suficiente para frenar un bucle de curl, no para un ataque
 * distribuido. Si hace falta un límite exacto, pasar a @upstash/ratelimit
 * (Vercel KV) sin cambiar la firma de allow().
 */

const WINDOW_MS = 60_000;
const LIMIT = 20;
const MAX_KEYS = 10_000;

const hits = new Map<string, number[]>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** true si la petición entra dentro del límite; false si hay que rechazarla con 429. */
export function allow(key: string, now = Date.now()): boolean {
  if (hits.size > MAX_KEYS) hits.clear();

  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** Solo para los tests: vacía el estado entre casos. */
export function resetRateLimit() {
  hits.clear();
}
