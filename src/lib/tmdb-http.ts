import { Agent, fetch as undiciFetch } from "undici";
import { lookup as dnsLookup } from "node:dns";
import { Resolver } from "node:dns/promises";

const TMDB_HOSTS = new Set(["api.themoviedb.org", "image.tmdb.org"]);

const publicResolver = new Resolver();
publicResolver.setServers(["8.8.8.8", "1.1.1.1"]);

const tmdbAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      if (TMDB_HOSTS.has(hostname)) {
        publicResolver
          .resolve4(hostname)
          .then((addresses) => {
            const ip = addresses[0];
            if (!ip) {
              callback(new Error(`No A record for ${hostname}`), "", 0);
              return;
            }
            callback(null, ip, 4);
          })
          .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), "", 0));
        return;
      }
      dnsLookup(hostname, options, callback);
    },
  },
});

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
      "TMDB TLS error — this server resolves TMDB to localhost. Panel now bypasses that; restart nexlify if you still see this."
    );
  }
  if (msg === "fetch failed" || combined.includes("econnrefused") || combined.includes("enotfound")) {
    return new Error("Cannot reach TMDB API from this server (network or DNS block).");
  }
  if (msg.includes("Timeout") || msg.includes("timeout")) {
    return new Error("TMDB request timed out — try again.");
  }
  return e;
}

/** Outbound fetch for TMDB — bypasses broken local DNS that points TMDB to 127.0.0.1. */
export async function tmdbFetch(url: string, timeoutMs = 20_000): Promise<Response> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await undiciFetch(url, {
        dispatcher: tmdbAgent,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok || res.status < 500 || attempt === attempts - 1) {
        return res as unknown as Response;
      }
    } catch (e) {
      lastError = e;
      if (attempt === attempts - 1) throw friendlyTmdbFetchError(e);
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }

  throw friendlyTmdbFetchError(lastError);
}
