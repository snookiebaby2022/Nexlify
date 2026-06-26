export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmPanelDomainsEnv } = await import("@/lib/domains");
    const { warmPanelServerEnv } = await import("@/lib/panel-server");
    const { warmPanelSecurityEnv } = await import("@/lib/panel-security-env");
    const { syncPanelLicenseEnvFromKey } = await import("@/lib/panel-license-env");
    await warmPanelDomainsEnv();
    await warmPanelServerEnv();
    await warmPanelSecurityEnv();
    syncPanelLicenseEnvFromKey();
  }
}
