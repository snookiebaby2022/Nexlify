/** Client-safe provider URL helpers (no server-only probe dependencies). */

export function normalizeProviderUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Base URL is required" };
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, error: "URL must use http or https" };
    }
    if (!url.hostname) return { ok: false, error: "URL must include a valid host" };
    return { ok: true, url: url.toString().replace(/\/$/, "") || url.origin };
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }
}

export type InferredRemoteConnection = {
  remoteHost: string | null;
  remotePort: number | null;
  remoteProtocol: string | null;
  remotePanelUrl: string | null;
};

/** Derive SSH/panel host details from the stream base URL (hostname, port, protocol, origin). */
export function inferRemoteConnectionFromUrl(raw: string): InferredRemoteConnection {
  const normalized = normalizeProviderUrl(raw);
  if (!normalized.ok) {
    return { remoteHost: null, remotePort: null, remoteProtocol: null, remotePanelUrl: null };
  }

  try {
    const url = new URL(normalized.url);
    const remoteHost = url.hostname || null;
    const defaultPort = url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : null;
    const remotePort = url.port ? Number(url.port) : defaultPort;
    const remoteProtocol =
      url.protocol === "https:" ? "https" : url.protocol === "http:" ? "http" : "other";
    return {
      remoteHost,
      remotePort,
      remoteProtocol,
      remotePanelUrl: url.origin,
    };
  } catch {
    return { remoteHost: null, remotePort: null, remoteProtocol: null, remotePanelUrl: null };
  }
}
