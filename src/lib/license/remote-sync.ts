import { prisma } from "@/lib/prisma";
import {
  activateLicenseKey,
  clearStoredLicense,
  getOrCreateInstanceId,
  getStoredLicense,
  storeRawKeyForOnline,
} from "@/lib/license";

const REMOTE_STATUS_KEY = "license.remote_status";

export type RemoteLicenseAction =
  | "activate"
  | "replace"
  | "revoke"
  | "suspend"
  | "unsuspend"
  | "delete";

function vendorWebBase(): string | null {
  const explicit = process.env.NEXLIFY_VENDOR_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const fromLicense = process.env.NEXLIFY_LICENSE_API_URL?.trim().replace(/\/$/, "");
  if (!fromLicense) return null;
  return fromLicense.replace(/\/v1$/i, "");
}

function panelApiSecret(): string | null {
  return (
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    process.env.PANEL_API_SECRET?.trim() ??
    null
  );
}

export async function getRemoteLicenseStatus(): Promise<string | null> {
  const row = await prisma.panelSetting.findUnique({ where: { key: REMOTE_STATUS_KEY } });
  return row?.value?.trim() || null;
}

export async function setRemoteLicenseStatus(status: string | null) {
  if (!status) {
    await prisma.panelSetting.deleteMany({ where: { key: REMOTE_STATUS_KEY } });
    return;
  }
  await prisma.panelSetting.upsert({
    where: { key: REMOTE_STATUS_KEY },
    create: { key: REMOTE_STATUS_KEY, value: status },
    update: { value: status },
  });
}

export async function clearLocalLicense() {
  await clearStoredLicense();
}

export async function resolvePanelPublicUrl(panelHost: string): Promise<string> {
  try {
    const { getSettingGroup } = await import("@/lib/panel-settings");
    const general = await getSettingGroup("general");
    const fromSettings = String(general.panelUrl ?? "").trim().replace(/\/$/, "");
    if (fromSettings) return fromSettings;
  } catch {
    /* optional */
  }
  const envUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim().replace(/\/$/, "");
  if (envUrl) return envUrl;
  const proto =
    process.env.PANEL_BEHIND_NGINX === "1" || process.env.PANEL_BEHIND_NGINX === "true"
      ? "http"
      : "https";
  return `${proto}://${panelHost}`;
}

async function vendorFetch(path: string, init?: RequestInit) {
  const base = vendorWebBase();
  const secret = panelApiSecret();
  if (!base || !secret) return null;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-panel-api-key": secret,
    ...(init?.headers as Record<string, string> | undefined),
  };

  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
}

export async function registerPanelWithVendor(
  licenseKey: string,
  panelHost: string
): Promise<void> {
  const instanceId = await getOrCreateInstanceId();
  const panelUrl = await resolvePanelPublicUrl(panelHost);
  await vendorFetch("/api/licenses/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseKey,
      instanceId,
      panelUrl,
      domain: panelHost,
    }),
  });
}

export async function applyRemoteLicenseAction(
  action: RemoteLicenseAction,
  licenseKey: string | undefined,
  panelHost: string
): Promise<{ ok: boolean; error?: string }> {
  switch (action) {
    case "activate":
    case "replace": {
      if (!licenseKey) return { ok: false, error: "licenseKey required" };
      const result = await activateLicenseKey(licenseKey, panelHost);
      if (!result.ok) return result;
      await storeRawKeyForOnline(licenseKey);
      await setRemoteLicenseStatus(null);
      await registerPanelWithVendor(licenseKey, panelHost);
      return { ok: true };
    }
    case "revoke":
    case "delete":
      await clearLocalLicense();
      return { ok: true };
    case "suspend":
      await setRemoteLicenseStatus("SUSPENDED");
      return { ok: true };
    case "unsuspend":
      await setRemoteLicenseStatus(null);
      return { ok: true };
    default:
      return { ok: false, error: "Unknown action" };
  }
}

export async function pollVendorLicenseSync(panelHost: string): Promise<boolean> {
  const base = vendorWebBase();
  const secret = panelApiSecret();
  if (!base || !secret) return false;

  const instanceId = await getOrCreateInstanceId();
  const stored = await getStoredLicense();
  const keyHash = stored?.keyHash ?? "";
  const params = new URLSearchParams({ instanceId });
  if (keyHash) params.set("keyHash", keyHash);

  const res = await vendorFetch(`/api/licenses/sync?${params.toString()}`);
  if (!res?.ok) return false;

  const data = (await res.json()) as {
    action?: string | null;
    licenseKey?: string;
    licenseId?: string;
  };
  if (!data.action || !data.licenseId) return true;

  const action = data.action.toLowerCase() as RemoteLicenseAction;
  const mapped =
    action === "activate"
      ? "activate"
      : action === "replace"
        ? "replace"
        : action === "revoke"
          ? "revoke"
          : action === "suspend"
            ? "suspend"
            : action === "unsuspend"
              ? "unsuspend"
              : action === "delete"
                ? "delete"
                : null;

  if (!mapped) return false;

  const result = await applyRemoteLicenseAction(mapped, data.licenseKey, panelHost);

  await vendorFetch("/api/licenses/sync", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseId: data.licenseId,
      ok: result.ok,
      error: result.error,
    }),
  });

  return result.ok;
}
