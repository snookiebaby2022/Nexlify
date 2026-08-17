import http from "node:http";
import https from "node:https";

/**
 * Per-request TLS for IPTV CDNs with expired/self-signed certs.
 * Do not set NODE_TLS_REJECT_UNAUTHORIZED=0 on the process.
 */
const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

export function fetchAllowingBadCerts(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error("Invalid URL"));
  }

  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers[key] = value;
    });
  }

  const timeoutMs = (() => {
    const signal = init?.signal;
    if (!signal) return 120_000;
    return 120_000;
  })();

  return new Promise((resolve, reject) => {
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const reqOpts: https.RequestOptions = {
      method,
      headers,
      timeout: timeoutMs,
    };
    if (isHttps) {
      reqOpts.agent = insecureHttpsAgent;
      reqOpts.rejectUnauthorized = false;
    }

    const req = lib.request(parsed, reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const outHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === "string") outHeaders.set(key, value);
          else if (Array.isArray(value)) outHeaders.set(key, value.join(", "));
        }
        resolve(
          new Response(buf, {
            status: res.statusCode ?? 502,
            headers: outHeaders,
          })
        );
      });
      res.on("error", reject);
    });

    req.on("timeout", () => req.destroy(new Error("Upstream timeout")));
    req.on("error", reject);
    if (init?.signal) {
      if (init.signal.aborted) {
        req.destroy(new Error("aborted"));
        return;
      }
      init.signal.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true });
    }
    req.end();
  });
}
