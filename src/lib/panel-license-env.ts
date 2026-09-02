import { parseLicenseKey } from "@/lib/license/crypto";
import { isPanelLicenseExempt, isPanelLicenseExemptEnv } from "@/lib/panel-demo-host";

/** Node-only: set NEXLIFY_LICENSE_VALID for Edge middleware (no crypto in middleware). */
export async function syncPanelLicenseEnv() {
  delete process.env.NEXLIFY_LICENSE_VALID;
  if (isPanelLicenseExemptEnv()) {
    process.env.NEXLIFY_LICENSE_VALID = "1";
    return;
  }
  const primaryHost = process.env.PANEL_PRIMARY_DOMAIN ?? "";
  if (primaryHost && isPanelLicenseExempt(primaryHost)) {
    process.env.NEXLIFY_LICENSE_VALID = "1";
    return;
  }
  const key = process.env.NEXLIFY_LICENSE_KEY?.trim();
  if (key) {
    const parsed = parseLicenseKey(key);
    if (parsed && parsed.payload.exp * 1000 > Date.now()) {
      process.env.NEXLIFY_LICENSE_VALID = "1";
      return;
    }
  }
  try {
    const { getStoredLicense } = await import("@/lib/license/state");
    const stored = await getStoredLicense();
    if (stored && stored.exp * 1000 > Date.now()) {
      process.env.NEXLIFY_LICENSE_VALID = "1";
    }
  } catch {
    /* DB unavailable during build */
  }
}

/** @deprecated Use syncPanelLicenseEnv */
export function syncPanelLicenseEnvFromKey() {
  void syncPanelLicenseEnv();
}
