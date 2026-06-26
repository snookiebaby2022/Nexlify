export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmPanelSecurityEnv } = await import("@/lib/panel-security-env");
    await warmPanelSecurityEnv();
    const { warmPanelServerEnv } = await import("@/lib/panel-server");
    await warmPanelServerEnv();
    try {
      const { getPanelDomainsSettings, syncPanelDomainsEnv } = await import("@/lib/domains");
      syncPanelDomainsEnv(await getPanelDomainsSettings());
    } catch {
      /* DB unavailable during build */
    }
  }
}
