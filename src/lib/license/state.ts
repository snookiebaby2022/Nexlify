import { decryptAtRest, encryptAtRest, isEncryptedAtRest } from "@/lib/encryption-at-rest";
import { prisma } from "@/lib/prisma";
import { isPanelLicenseExempt, isPanelLicenseExemptEnv } from "@/lib/panel-demo-host";
import type { LicensePayloadV1, LicenseStatus } from "./types";
import { parseLicenseKey, licenseKeyHash, hostAllowed } from "./crypto";
import { licenseTermLabel } from "./terms";

async function getCurrentPublicIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=text", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const ip = (await res.text()).trim();
      if (ip) return ip;
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch("https://ipapi.co/ip/", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const ip = (await res.text()).trim();
      if (ip) return ip;
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

const STATE_KEY = "license.state";
const INSTANCE_KEY = "license.instance_id";
const TRIAL_KEY = "license.trial_started";
const REMOTE_STATUS_KEY = "license.remote_status";

export type StoredLicenseState = {
  keyHash: string;
  lid: string;
  sub: string;
  tier: string;
  term?: string;
  exp: number;
  boundInstanceId: string;
  boundIp: string;
  activatedAt: string;
  lastVerifiedAt: string;
  onlineOk?: boolean;
};

export async function getOrCreateInstanceId(): Promise<string> {
  const row = await prisma.panelSetting.findUnique({ where: { key: INSTANCE_KEY } });
  if (row?.value) return row.value;
  const { newInstanceId } = await import("./crypto");
  const id = newInstanceId();
  await prisma.panelSetting.create({ data: { key: INSTANCE_KEY, value: id } });
  return id;
}

export async function getStoredLicense(): Promise<StoredLicenseState | null> {
  const row = await prisma.panelSetting.findUnique({ where: { key: STATE_KEY } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as StoredLicenseState;
  } catch {
    return null;
  }
}

export async function saveLicenseActivation(
  key: string,
  payload: LicensePayloadV1,
  instanceId: string
) {
  const boundIp = await getCurrentPublicIp();
  const state: StoredLicenseState = {
    keyHash: licenseKeyHash(key),
    lid: payload.lid,
    sub: payload.sub,
    tier: payload.tier,
    term: payload.term ?? payload.tier,
    exp: payload.exp,
    boundInstanceId: instanceId,
    boundIp,
    activatedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  };
  const { limitsFromSlug, limitsFromMaxServers, storePlanLimits } = await import("@/lib/plan-limits");
  const limits =
    payload.maxServers != null && payload.maxServers > 0
      ? limitsFromMaxServers(payload.maxServers)
      : limitsFromSlug(payload.tier);
  await storePlanLimits(limits);

  await prisma.panelSetting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: JSON.stringify(state) },
    update: { value: JSON.stringify(state) },
  });
}

export async function getTrialStart(): Promise<Date | null> {
  const row = await prisma.panelSetting.findUnique({ where: { key: TRIAL_KEY } });
  if (!row?.value) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function ensureTrialStarted(): Promise<Date> {
  const existing = await getTrialStart();
  if (existing) return existing;
  const now = new Date();
  await prisma.panelSetting.upsert({
    where: { key: TRIAL_KEY },
    create: { key: TRIAL_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  return now;
}

export function trialDays(): number {
  const n = Number(process.env.NEXLIFY_LICENSE_TRIAL_DAYS ?? "14");
  return Number.isFinite(n) && n > 0 ? n : 14;
}

export async function activateLicenseKey(
  rawKey: string,
  panelHost: string
): Promise<{ ok: true; status: LicenseStatus } | { ok: false; error: string }> {
  const parsed = parseLicenseKey(rawKey);
  if (!parsed) return { ok: false, error: "Invalid or forged license key" };

  const { payload, key } = parsed;
  if (payload.exp * 1000 < Date.now()) {
    return { ok: false, error: "License expired" };
  }

  if (!hostAllowed(payload, panelHost) && panelHost !== "localhost" && panelHost !== "127.0.0.1") {
    return { ok: false, error: "License not valid for this domain" };
  }

  const instanceId = await getOrCreateInstanceId();
  const hash = licenseKeyHash(key);
  const existing = await getStoredLicense();

  if (
    payload.iid &&
    payload.iid !== "BIND_ON_ACTIVATE" &&
    payload.iid !== instanceId
  ) {
    return { ok: false, error: "License bound to another installation" };
  }

  // Same installation may replace its license (renew / upgrade to a new key).
  if (existing && existing.keyHash === hash && existing.boundInstanceId !== instanceId) {
    return { ok: false, error: "This license is already activated elsewhere" };
  }

  const online = await verifyOnlineIfRequired(key, instanceId, panelHost);
  if (!online.ok) return { ok: false, error: online.error ?? "Online license check failed" };

  await saveLicenseActivation(key, payload, instanceId);

  try {
    const { syncAddonLicensesFromBilling } = await import("@/lib/billing-addon-sync");
    await syncAddonLicensesFromBilling(key);
  } catch {
    /* billing addon sync optional */
  }

  return {
    ok: true,
    status: await buildStatus(payload, instanceId, true),
  };
}

async function validateWithVendor(
  key: string,
  instanceId: string
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const api = licenseApiUrl();
  if (!api) return { ok: true };

  try {
    const res = await fetch(`${api.replace(/\/$/, "")}/v1/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: key, instance_id: instanceId }),
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, error: "Invalid license server response" };
    }
    const data = (await res.json()) as { ok?: boolean; status?: string; error?: string };
    if (!data.ok) {
      return { ok: false, status: data.status, error: data.error ?? "License validation failed" };
    }
    return { ok: true, status: data.status ?? "ACTIVE" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: message };
  }
}

async function getRemoteAdminStatus(): Promise<string | null> {
  const row = await prisma.panelSetting.findUnique({ where: { key: REMOTE_STATUS_KEY } });
  return row?.value?.trim() || null;
}

async function setRemoteAdminStatus(status: string | null) {
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

export async function clearStoredLicense() {
  await prisma.panelSetting.deleteMany({
    where: { key: { in: [STATE_KEY, "license.raw", REMOTE_STATUS_KEY] } },
  });
}

function licenseApiUrl(): string | null {
  const url = process.env.NEXLIFY_LICENSE_API_URL?.trim();
  if (!url) return null;
  if (process.env.NEXLIFY_LICENSE_API_LOCAL === "1") {
    try {
      const u = new URL(url);
      return `http://127.0.0.1:${u.port || "8787"}`;
    } catch {
      return "http://127.0.0.1:8787";
    }
  }
  return url;
}

async function verifyOnlineIfRequired(
  key: string,
  instanceId: string,
  host: string
): Promise<{ ok: boolean; error?: string }> {
  const requireOnline = process.env.NEXLIFY_LICENSE_REQUIRE_ONLINE === "1";
  const api = licenseApiUrl();
  if (!api) {
    if (requireOnline) {
      return {
        ok: false,
        error:
          "Online activation required. Set NEXLIFY_LICENSE_API_URL to your main license server.",
      };
    }
    return { ok: true };
  }

  // Offline activation allowed — skip HTTP call (avoids HTML 404 from marketing site URL).
  if (!requireOnline) {
    return { ok: true };
  }

  try {
    const res = await fetch(`${api.replace(/\/$/, "")}/v1/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: key,
        instance_id: instanceId,
        domain: host,
        version: process.env.npm_package_version ?? "0.1.1",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        error:
          "License server returned an invalid response. NEXLIFY_LICENSE_API_URL must point to the license API (e.g. https://nexlify.live/v1/activate), not the marketing website root.",
      };
    }
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error ?? `License server HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "License server unreachable" };
  }
}

export async function revalidateStoredLicense(panelHost: string): Promise<boolean> {
  const envKey = process.env.NEXLIFY_LICENSE_KEY?.trim();
  if (envKey) {
    const p = parseLicenseKey(envKey);
    if (p && p.payload.exp * 1000 > Date.now()) return true;
  }

  const remoteStatus = await getRemoteAdminStatus();
  if (remoteStatus === "SUSPENDED" || remoteStatus === "REVOKED") {
    if (remoteStatus === "REVOKED") {
      await clearStoredLicense();
    }
    return false;
  }

  const stored = await getStoredLicense();
  if (!stored) return false;
  if (stored.exp * 1000 < Date.now()) return false;

  const instanceId = await getOrCreateInstanceId();
  if (stored.boundInstanceId !== instanceId) return false;

  const currentIp = await getCurrentPublicIp();
  if (stored.boundIp && stored.boundIp !== "unknown" && currentIp !== "unknown" && stored.boundIp !== currentIp) {
    return false;
  }

  if (process.env.NEXLIFY_LICENSE_API_URL) {
    const key = await readLicenseRawKey();
    if (key) {
      const validated = await validateWithVendor(key, instanceId);
      if (!validated.ok) {
        if (validated.status === "REVOKED") {
          await clearStoredLicense();
        } else if (validated.status === "SUSPENDED") {
          await setRemoteAdminStatus("SUSPENDED");
        }
        return false;
      }
      if (validated.status === "SUSPENDED") {
        await setRemoteAdminStatus("SUSPENDED");
        return false;
      }
      await setRemoteAdminStatus(null);
      const online = await verifyOnlineIfRequired(key, instanceId, panelHost);
      if (!online.ok) return false;
    }
  }

  await prisma.panelSetting.update({
    where: { key: STATE_KEY },
    data: {
      value: JSON.stringify({
        ...stored,
        lastVerifiedAt: new Date().toISOString(),
      }),
    },
  });

  return true;
}

/** Read license key from DB; migrates legacy plain-text rows to AES-256-GCM. */
export async function readLicenseRawKey(): Promise<string | null> {
  const row = await prisma.panelSetting.findUnique({ where: { key: "license.raw" } });
  if (!row?.value?.trim()) return null;
  try {
    const plain = decryptAtRest(row.value.trim());
    if (plain && !isEncryptedAtRest(row.value)) {
      await storeRawKeyForOnline(plain);
    }
    return plain || null;
  } catch {
    return row.value.trim();
  }
}

/** Store raw key for online revalidation (AES-256-GCM in PostgreSQL). */
export async function storeRawKeyForOnline(key: string) {
  if (!process.env.NEXLIFY_LICENSE_API_URL) return;
  let stored = key;
  try {
    stored = encryptAtRest(key);
  } catch {
    /* dev without ENCRYPTION_AT_REST_KEY — store plain until ensure-security-env runs */
  }
  await prisma.panelSetting.upsert({
    where: { key: "license.raw" },
    create: { key: "license.raw", value: stored },
    update: { value: stored },
  });
}

async function buildStatus(
  payload: LicensePayloadV1,
  instanceId: string,
  valid: boolean,
  boundIp?: string
): Promise<LicenseStatus> {
  const term = payload.term ?? payload.tier;
  return {
    valid,
    trial: false,
    licensed: valid,
    tier: payload.tier,
    term,
    termLabel: licenseTermLabel(term),
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    licensee: payload.sub,
    licenseId: payload.lid,
    instanceBound: Boolean(payload.iid || instanceId),
    boundIp,
    onlineRequired: Boolean(process.env.NEXLIFY_LICENSE_API_URL?.trim()),
    lastVerifiedAt: new Date().toISOString(),
  };
}

export async function getLicenseStatus(panelHost: string): Promise<LicenseStatus> {
  if (isPanelLicenseExempt(panelHost)) {
    return {
      valid: true,
      trial: false,
      licensed: true,
      tier: "demo",
      termLabel: "Demo sandbox",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }


  const envKey = process.env.NEXLIFY_LICENSE_KEY?.trim();
  if (envKey) {
    const parsed = parseLicenseKey(envKey);
    if (parsed && parsed.payload.exp * 1000 > Date.now()) {
      if (hostAllowed(parsed.payload, panelHost) || isLocal(panelHost)) {
        const term = parsed.payload.term ?? parsed.payload.tier;
        return {
          valid: true,
          trial: false,
          licensed: true,
          tier: parsed.payload.tier,
          term,
          termLabel: licenseTermLabel(term),
          expiresAt: new Date(parsed.payload.exp * 1000).toISOString(),
          licensee: parsed.payload.sub,
          licenseId: parsed.payload.lid,
        };
      }
    }
  }

  const stored = await getStoredLicense();
  if (stored && stored.exp * 1000 > Date.now()) {
    const instanceId = await getOrCreateInstanceId();
    if (stored.boundInstanceId === instanceId) {
      const remoteStatus = await getRemoteAdminStatus();
      if (remoteStatus === "SUSPENDED") {
        return { valid: false, reason: "License suspended by vendor — contact support" };
      }
      if (remoteStatus === "REVOKED") {
        return { valid: false, reason: "License revoked by vendor" };
      }
      const term = stored.term ?? stored.tier;
      return {
        valid: true,
        trial: false,
        licensed: true,
        tier: stored.tier,
        term,
        termLabel: licenseTermLabel(term),
        expiresAt: new Date(stored.exp * 1000).toISOString(),
        licensee: stored.sub,
        licenseId: stored.lid,
        instanceBound: true,
        boundIp: stored.boundIp,
        lastVerifiedAt: stored.lastVerifiedAt,
        onlineRequired: Boolean(process.env.NEXLIFY_LICENSE_API_URL?.trim()),
      };
    }
    return { valid: false, reason: "License bound to another installation" };
  }

  if (process.env.NEXLIFY_LICENSE_REQUIRE !== "0") {
    const { getSettingGroup } = await import("@/lib/panel-settings");
    const general = await getSettingGroup("general");
    if (Boolean(general.disableTrial)) {
      return { valid: false, reason: "Trial disabled — enter a license key" };
    }
    const start = await ensureTrialStarted();
    const end = new Date(start);
    end.setDate(end.getDate() + trialDays());
    if (end > new Date()) {
      return {
        valid: true,
        trial: true,
        licensed: false,
        trialEndsAt: end.toISOString(),
        tier: "trial",
        termLabel: "14-day trial",
        expiresAt: end.toISOString(),
      };
    }
    return { valid: false, reason: "Trial expired — enter a license key" };
  }

  return { valid: true, tier: "unlicensed_dev" };
}

function isLocal(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export async function isPanelLicensed(panelHost: string): Promise<boolean> {
  if (isPanelLicenseExempt(panelHost)) return true;
  const s = await getLicenseStatus(panelHost);
  return s.valid;
}
