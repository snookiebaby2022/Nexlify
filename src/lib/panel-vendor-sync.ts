import { getPanelServerSettings, getResolvedRepoPath } from "./panel-server";
import { readInstalledVersion } from "./panel-version";

export async function registerPanelWithVendor(): Promise<{ ok: boolean; error?: string }> {
  const vendorUrl = process.env.NEXLIFY_VENDOR_URL?.trim();
  const secret =
    process.env.PANEL_INTERNAL_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();

  if (!vendorUrl || !secret) {
    return { ok: false, error: "No vendor URL or secret configured" };
  }

  try {
    const server = await getPanelServerSettings();
    const repoPath = getResolvedRepoPath(server);
    const { version } = await readInstalledVersion(repoPath);

    const panelUrl = process.env.NEXT_PUBLIC_PANEL_URL?.trim() ||
      (server.domain ? `https://${server.domain}` : undefined);

    if (!panelUrl) {
      return { ok: false, error: "No panel URL configured" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${vendorUrl}/api/internal/panel-register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-panel-internal-secret": secret,
      },
      body: JSON.stringify({
        url: panelUrl,
        version,
        domain: server.domain || null,
        ip: server.primaryIp || null,
        metadata: { nodeEnv: process.env.NODE_ENV, platform: process.platform, nodeVersion: process.version },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      console.log("[panel-register] Registered with vendor:", vendorUrl);
      return { ok: true };
    } else {
      const text = await res.text();
      return { ok: false, error: `Vendor returned ${res.status}: ${text.slice(0, 200)}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function sendPanelHeartbeat(): Promise<{ ok: boolean; error?: string }> {
  const vendorUrl = process.env.NEXLIFY_VENDOR_URL?.trim();
  const secret =
    process.env.PANEL_INTERNAL_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim();

  if (!vendorUrl || !secret) return { ok: false, error: "No vendor URL or secret configured" };

  try {
    const server = await getPanelServerSettings();
    const repoPath = getResolvedRepoPath(server);
    const { version } = await readInstalledVersion(repoPath);
    const panelUrl = process.env.NEXT_PUBLIC_PANEL_URL?.trim() || (server.domain ? `https://${server.domain}` : undefined);
    if (!panelUrl) return { ok: false, error: "No panel URL configured" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${vendorUrl}/api/internal/panel-heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-panel-internal-secret": secret },
      body: JSON.stringify({ url: panelUrl, version }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: res.ok };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
