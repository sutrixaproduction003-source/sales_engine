/**
 * Server-side geocoding for discovery results (Node runtime only — never
 * import this from client components).
 *
 * Provider: OpenStreetMap Nominatim (https://nominatim.org) — a legitimate,
 * free geocoding service that requires NO API key, so no secrets are involved.
 * Usage policy allows ~1 request/second, which the throttle below respects.
 *
 * Guarantees:
 *  - Results are cached in memory so repeated searches for the same location
 *    never trigger another geocoding call.
 *  - Unresolvable locations return null — coordinates are NEVER generated,
 *    estimated, or invented to place a marker.
 *  - Per-request usage is budget-capped (GEOCODE_MAX_PER_REQUEST) so one
 *    search cannot hammer the service.
 *  - Set GEOCODE_ENABLED=false to disable geocoding entirely.
 */

const CACHE = new Map<string, { latitude: number; longitude: number } | null>();

export const GEOCODE_MAX_PER_REQUEST = 10;
const MIN_INTERVAL_MS = 1100; // Nominatim usage policy: max 1 request/second
const REQUEST_TIMEOUT_MS = 8000;

let lastCallAt = 0;

async function throttle(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastCallAt = Date.now();
}

export function geocodeEnabled(): boolean {
  return process.env.GEOCODE_ENABLED !== "false";
}

/**
 * Resolve a free-text location (e.g. "Taj Lake Road, Udaipur") to real
 * coordinates. Returns null when geocoding is disabled, the location cannot
 * be resolved, or the service fails. Network failures are not cached so a
 * later search can retry; genuine "not found" results are cached as null.
 */
export async function geocodeLocation(
  location: string
): Promise<{ latitude: number; longitude: number } | null> {
  const key = location.trim().toLowerCase();
  if (!geocodeEnabled() || !key) return null;

  if (CACHE.has(key)) return CACHE.get(key) ?? null;

  await throttle();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
      location.trim()
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "SalesEngine/1.0 (lead location geocoding)",
        "Accept-Language": "en",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      CACHE.set(key, null);
      return null;
    }

    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = Array.isArray(data) ? data[0] : undefined;
    const latitude = Number(hit?.lat);
    const longitude = Number(hit?.lon);
    const result =
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;

    CACHE.set(key, result);
    return result;
  } catch {
    // Timeout / network / parse errors — do not cache; a later search may retry.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
