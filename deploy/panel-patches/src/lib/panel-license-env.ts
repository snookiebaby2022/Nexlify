import { parseLicenseKey } from "@/lib/license/crypto";
import { isPanelLicenseExemptEnv } from "@/lib/panel-demo-host";

/** Node-only: set NEXLIFY_LICENSE_VALID for Edge middleware (no crypto in middleware). */
export function syncPanelLicenseEnvFromKey() {
  delete process.env.NEXLIFY_LICENSE_VALID;
  if (isPanelLicenseExemptEnv()) return;
  const key = process.env.NEXLIFY_LICENSE_KEY?.trim();
  if (!key) return;
  const parsed = parseLicenseKey(key);
  if (parsed && parsed.payload.exp * 1000 > Date.now()) {
    process.env.NEXLIFY_LICENSE_VALID = "1";
  }
}
