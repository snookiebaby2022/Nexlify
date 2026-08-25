export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installBenignWebStreamGuards, isBenignWebStreamClose } = await import("@/lib/web-stream-safety");
    installBenignWebStreamGuards();
    process.on("uncaughtException", (err) => {
      if (isBenignWebStreamClose(err)) return;
      console.error("[uncaughtException]", err);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      if (isBenignWebStreamClose(reason)) return;
      console.error("[unhandledRejection]", reason);
    });

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
