import { prisma } from "@/lib/prisma";

const STARTUP_VALIDATED_KEY = "license.startup_validated_at";
const HEARTBEAT_FAIL_KEY = "license.heartbeat_failures";

export async function startupValidationOk(): Promise<boolean> {
  if (process.env.NEXLIFY_LICENSE_REQUIRE === "0") return true;
  try {
    const row = await prisma.panelSetting.findUnique({ where: { key: STARTUP_VALIDATED_KEY } });
    if (!row?.value) return false;
    const validatedAt = new Date(row.value).getTime();
    if (isNaN(validatedAt)) return false;
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    return validatedAt > fourHoursAgo;
  } catch {
    return false;
  }
}

export async function startupLicenseValidation(): Promise<{ ok: boolean; reason?: string }> {
  if (process.env.NEXLIFY_LICENSE_REQUIRE === "0") {
    return { ok: true, reason: "dev_bypass" };
  }

  const host = process.env.PANEL_PRIMARY_DOMAIN ?? "localhost";

  const envKey = process.env.NEXLIFY_LICENSE_KEY?.trim();
  if (envKey) {
    const { parseLicenseKey } = await import("@/lib/license");
    const parsed = parseLicenseKey(envKey);
    if (parsed && parsed.payload.exp * 1000 > Date.now()) {
      await markStartupValidated();
      return { ok: true, reason: "env_key" };
    }
  }

  const { getStoredLicense, revalidateStoredLicense } = await import("@/lib/license");
  const stored = await getStoredLicense();
  if (!stored) {
    return { ok: false, reason: "no_license" };
  }
  if (stored.exp * 1000 < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const { getOrCreateInstanceId, isEmailBoundLicense, licenseEmailMatches } = await import("@/lib/license");
  if (isEmailBoundLicense()) {
    if (!licenseEmailMatches(stored)) {
      return { ok: false, reason: "email_mismatch" };
    }
  } else {
    const instanceId = await getOrCreateInstanceId();
    if (stored.boundInstanceId && stored.boundInstanceId !== instanceId) {
      return { ok: false, reason: "wrong_instance" };
    }
  }

  if (process.env.NEXLIFY_LICENSE_API_URL) {
    const ok = await revalidateStoredLicense(host);
    if (!ok) {
      return { ok: false, reason: "vendor_rejection" };
    }
  }

  await markStartupValidated();
  await resetHeartbeatFailures();
  return { ok: true };
}

export async function heartbeatCheck(): Promise<{ ok: boolean; reason?: string }> {
  if (process.env.NEXLIFY_LICENSE_REQUIRE === "0") {
    return { ok: true };
  }

  const host = process.env.PANEL_PRIMARY_DOMAIN ?? "localhost";

  try {
    const { pollVendorLicenseSync } = await import("@/lib/license/remote-sync");
    const { revalidateStoredLicense } = await import("@/lib/license");
    await pollVendorLicenseSync(host);
    const ok = await revalidateStoredLicense(host);

    if (ok) {
      await resetHeartbeatFailures();
      return { ok: true };
    }

    const failures = await incrementHeartbeatFailures();
    if (failures >= 3) {
      const { clearStoredLicense } = await import("@/lib/license");
      await clearStoredLicense();
      return { ok: false, reason: `license_invalidated_after_${failures}_failures` };
    }

    return { ok: false, reason: `validation_failed_attempt_${failures}` };
  } catch (e) {
    // Network errors are transient — do NOT permanently clear the license.
    // Only increment the failure counter and report the error.
    const failures = await incrementHeartbeatFailures();
    console.warn(`[license] Heartbeat network error (attempt ${failures}/3):`, e instanceof Error ? e.message : e);
    return { ok: false, reason: `network_error_attempt_${failures}` };
  }
}

async function markStartupValidated(): Promise<void> {
  try {
    await prisma.panelSetting.upsert({
      where: { key: STARTUP_VALIDATED_KEY },
      update: { value: new Date().toISOString() },
      create: { key: STARTUP_VALIDATED_KEY, value: new Date().toISOString() },
    });
  } catch { /* DB unavailable */ }
}

async function getHeartbeatFailures(): Promise<number> {
  try {
    const row = await prisma.panelSetting.findUnique({ where: { key: HEARTBEAT_FAIL_KEY } });
    return parseInt(row?.value ?? "0", 10) || 0;
  } catch { return 0; }
}

async function incrementHeartbeatFailures(): Promise<number> {
  const current = await getHeartbeatFailures();
  const next = current + 1;
  try {
    await prisma.panelSetting.upsert({
      where: { key: HEARTBEAT_FAIL_KEY },
      update: { value: String(next) },
      create: { key: HEARTBEAT_FAIL_KEY, value: String(next) },
    });
  } catch { /* DB unavailable */ }
  return next;
}

async function resetHeartbeatFailures(): Promise<void> {
  try {
    await prisma.panelSetting.upsert({
      where: { key: HEARTBEAT_FAIL_KEY },
      update: { value: "0" },
      create: { key: HEARTBEAT_FAIL_KEY, value: "0" },
    });
  } catch { /* DB unavailable */ }
}
