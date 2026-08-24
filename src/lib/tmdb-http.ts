import { fetchWithRetry } from "@/lib/fetch-retry";

function friendlyTmdbFetchError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error("TMDB request failed");
  const msg = e.message;
  const cause = e.cause instanceof Error ? e.cause.message : String(e.cause ?? "");
  const combined = `${msg} ${cause}`.toLowerCase();
  if (
    combined.includes("certificate") ||
    combined.includes("self-signed") ||
    combined.includes("unable to verify") ||
    combined.includes("cert_")
  ) {
    return new Error(
      "TMDB TLS error — server cannot verify HTTPS certificates. Run: apt install ca-certificates && update-ca-certificates, then restart the panel."
    );
  }
  if (msg === "fetch failed" || combined.includes("econnrefused") || combined.includes("enotfound")) {
    return new Error("Cannot reach TMDB API from this server (network or firewall).");
  }
  if (msg.includes("Timeout") || msg.includes("timeout")) {
    return new Error("TMDB request timed out — try again.");
  }
  return e;
}

/** Outbound fetch for TMDB with retries and clearer TLS/network errors. */
export async function tmdbFetch(url: string, timeoutMs = 20_000): Promise<Response> {
  try {
    return await fetchWithRetry(url, {
      signal: AbortSignal.timeout(timeoutMs),
      retries: 3,
      baseDelayMs: 500,
    });
  } catch (e) {
    throw friendlyTmdbFetchError(e);
  }
}
