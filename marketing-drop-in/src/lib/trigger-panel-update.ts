import { apiKeyForPanelUrl } from "@/lib/panel-sync";
import { preferReachablePanelUrls } from "@/lib/panel-url-variants";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type PanelUpdateTriggerResult = {
  url: string;
  ok: boolean;
  started?: boolean;
  reason?: string;
  message?: string;
};

async function postOnce(
  base: string,
  path: string,
  apiKey: string,
  force: boolean,
): Promise<{ status: number; data: Record<string, unknown> } | null> {
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-panel-api-key": apiKey,
        "x-panel-internal-secret": apiKey,
        "User-Agent": BROWSER_UA,
      },
      body: JSON.stringify({ force }),
      signal: AbortSignal.timeout(25_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, data };
  } catch {
    return null;
  }
}

function fromPayload(
  url: string,
  status: number,
  data: Record<string, unknown>,
): PanelUpdateTriggerResult {
  const started = data.started === true;
  const reason = typeof data.reason === "string" ? data.reason : undefined;
  const ok = status >= 200 && status < 300 && data.ok !== false;
  return {
    url,
    ok,
    started,
    reason,
    message:
      (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      (ok ? (started ? "Triggered" : reason || "OK") : `HTTP ${status}`),
  };
}

/** Hit a customer panel's remote-update API. Tries http for IPs (TLS often reset). */
export async function triggerPanelRemoteUpdate(opts: {
  panelUrl: string;
  apiKey?: string | null;
  force?: boolean;
}): Promise<PanelUpdateTriggerResult> {
  const bases = preferReachablePanelUrls(opts.panelUrl);
  if (!bases.length) {
    return { url: opts.panelUrl, ok: false, message: "Invalid panel URL" };
  }
  const apiKey = (opts.apiKey?.trim() || (await apiKeyForPanelUrl(bases[0]))) ?? "";
  if (!apiKey) {
    return { url: bases[0], ok: false, message: "No API secret registered for this panel" };
  }

  const paths = ["/api/admin/remote-update", "/api/internal/panel-update"];
  let last: PanelUpdateTriggerResult | null = null;
  for (const base of bases) {
    for (const path of paths) {
      const hit = await postOnce(base, path, apiKey, opts.force === true);
      if (!hit) {
        last = { url: base, ok: false, message: "Connection failed" };
        continue;
      }
      if (hit.status === 404 || hit.status === 405) {
        last = fromPayload(base, hit.status, hit.data);
        continue;
      }
      return fromPayload(base, hit.status, hit.data);
    }
  }
  return last ?? { url: bases[0], ok: false, message: "Connection failed" };
}
