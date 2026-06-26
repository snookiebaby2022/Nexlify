/**
 * Insert at the start of getLicenseStatus() in src/lib/license/state.ts:
 *
 *   if (isPanelLicenseExempt(panelHost)) {
 *     return {
 *       valid: true,
 *       trial: false,
 *       licensed: true,
 *       tier: "demo",
 *       termLabel: "Demo sandbox",
 *       expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
 *     };
 *   }
 *
 * Also add to saveLicenseActivation after building state:
 *   const { limitsFromSlug, limitsFromMaxServers, storePlanLimits } = await import("@/lib/plan-limits");
 *   const limits =
 *     payload.maxServers != null && payload.maxServers > 0
 *       ? limitsFromMaxServers(payload.maxServers)
 *       : limitsFromSlug(payload.tier);
 *   await storePlanLimits(limits);
 */

export {};
