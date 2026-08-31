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

    const { warmPanelSecurityEnv } = await import("@/lib/panel-security-env");
    await warmPanelSecurityEnv();
    const { warmPanelServerEnv } = await import("@/lib/panel-server");
    await warmPanelServerEnv();
    try {
      const { warmPanelDomainsEnv } = await import("@/lib/domains");
      await warmPanelDomainsEnv();
    } catch {
      /* DB unavailable during build */
    }
    try {
      const { repairAndSyncResellerDns } = await import("@/lib/reseller-dns");
      const { repaired, hosts } = await repairAndSyncResellerDns();
      if (repaired > 0) {
        console.log(`[reseller-dns] repaired ${repaired} malformed resellerDns row(s)`);
      }
      if (hosts.length > 0) {
        console.log(`[reseller-dns] synced ${hosts.length} reseller portal host(s)`);
      }
    } catch {
      /* DB unavailable during build */
    }
    // Sync NEXLIFY_LICENSE_VALID from env key or stored license so middleware
    // can fast-path the license check without a DB/cookie round-trip.
    try {
      const { syncPanelLicenseEnv } = await import("@/lib/panel-license-env");
      await syncPanelLicenseEnv();
    } catch {
      /* key parse failure — license gate will fall back to cookie check */
    }
    try {
      const { startupLicenseValidation } = await import("@/lib/license/server-guard");
      const result = await startupLicenseValidation();
      if (!result.ok) {
        console.error(`[LICENSE] Startup validation failed: ${result.reason}`);
        console.error("[LICENSE] Panel will run in limited mode until license is validated.");
      } else {
        console.log(`[LICENSE] Startup validation passed (${result.reason})`);
      }
    } catch (e) {
      console.error("[LICENSE] Startup validation error:", e);
    }
    try {
      const { ensurePanelUpdateAutoApplyOffByDefault, ensureAddonSettingsHealed, ensureInstantStreamingDefaults } =
        await import("@/lib/panel-settings");
      await ensurePanelUpdateAutoApplyOffByDefault();
      await ensureAddonSettingsHealed();
      await ensureInstantStreamingDefaults();
    } catch {
      /* DB unavailable during build / early boot */
    }
    try {
      const { ensureRedisConnected } = await import("@/lib/redis");
      if (await ensureRedisConnected()) {
        console.log("[redis] connected at worker startup");
      } else {
        console.warn("[redis] not ready at worker startup — cache will retry on demand");
      }
    } catch {
      /* REDIS_URL unset or ioredis unavailable */
    }
  }
}
