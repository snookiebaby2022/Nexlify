import https from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { Resolver } from "node:dns/promises";

const TMDB_HOSTS = new Set(["api.themoviedb.org", "image.tmdb.org"]);

const publicResolver = new Resolver();
publicResolver.setServers(["8.8.8.8", "1.1.1.1"]);

async function resolveConnectHost(hostname: string): Promise<{ connectHost: string; servername: string }> {
  if (!TMDB_HOSTS.has(hostname)) {
    return { connectHost: hostname, servername: hostname };
  }
  const ips = await publicResolver.resolve4(hostname);
  const ip = ips[0];
  if (!ip) throw new Error(`No A record for ${hostname}`);
  return { connectHost: ip, servername: hostname };
}

function friendlyTmdbFetchError(e: unknown): Error {
  if (!(e instanceof Error)) return new Error("TMDB request failed");
  const msg = e.message;
  const cause = e.cause instanceof Error ? e.cause.message : String(e.cause ?? "");
  const combined = `${msg} ${cause}`.toLowerCase();
  if (
    combined.includes("certificate") ||
    combined.includes("self-signed") ||
    combined.includes("unable to verify")
  ) {
    return new Error(
      "TMDB TLS error — this server resolves TMDB to localhost. Panel bypasses that via public DNS; restart nexlify if this persists."
    );
  }
  if (msg === "fetch failed" || combined.includes("econnrefused") || combined.includes("enotfound")) {
    return new Error("Cannot reach TMDB API from this server (network or DNS block).");
  }
  if (msg.includes("timeout")) {
    return new Error("TMDB request timed out — try again.");
  }
  return e;
}

function httpsGet(url: string, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    void resolveConnectHost(parsed.hostname)
      .then(({ connectHost, servername }) => {
        const req = https.request(
          {
            hostname: connectHost,
            servername,
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            headers: {
              Host: parsed.hostname,
              Accept: "application/json",
            },
            timeout: timeoutMs,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
              const body = Buffer.concat(chunks);
              resolve(
                new Response(body, {
                  status: res.statusCode ?? 500,
                  headers: Object.fromEntries(
                    Object.entries(res.headers).filter(([, v]) => v != null) as [string, string][]
                  ),
                })
              );
            });
          }
        );
        req.on("error", (err) => reject(err));
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("TMDB request timed out"));
        });
        req.end();
      })
      .catch(reject);
  });
}

/** Outbound fetch for TMDB — bypasses broken local DNS that points TMDB to 127.0.0.1. */
export async function tmdbFetch(url: string, timeoutMs = 20_000): Promise<Response> {
  const attempts = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await httpsGet(url, timeoutMs);
      if (res.status === 429 && attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        continue;
      }
      if (res.ok || res.status < 500 || attempt === attempts - 1) {
        return res;
      }
    } catch (e) {
      lastError = e;
      if (attempt === attempts - 1) throw friendlyTmdbFetchError(e);
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }

  throw friendlyTmdbFetchError(lastError);
}

// Keep dnsLookup referenced so bundlers retain node built-ins for non-TMDB paths (unused today).
void dnsLookup;
