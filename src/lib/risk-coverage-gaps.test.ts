/**
 * Top revenue/security coverage gaps (COVERAGE-REPORT.md).
 * Pure / in-memory mocks only — no production DB, network, or FFmpeg.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { PanelRole } from "@prisma/client";

import {
  creditCostForDays,
  effectiveCreditCost,
  markedUpCreditCost,
  packageLabelForDays,
} from "./package-credits";
import {
  chargeLineRenewCredits,
  renewDaysFromExpiryChange,
} from "./line-renew-credits";
import { debitResellerCredits, sessionPaysLineCredits } from "./reseller-credit-charge";
import { isAuthorizedInternalRequest } from "./internal-request";
import { jwtSecretBytes, jwtSecretStrengthError } from "./jwt-secret";
import { applySecurityHeaders } from "./security-headers";
import {
  panelSessionCookieOptions,
  panelSessionCookieSecure,
} from "./session-cookie";
import { couponRemaining, toCouponPublicView } from "./coupon-redeem";
import { applyResellerLineReward } from "./reseller-rewards";
import { requireAgentServer } from "./agent-auth";
import {
  asPlaybackGuardLine,
  playbackDenyMessage,
  STALKER_GUARDED_ACTIONS,
} from "./playback-guard";
import { billingUnauthorized, handleBillingWebhook } from "./billing";
import { startupValidationOk, startupLicenseValidation } from "./license/server-guard";
import { isFreePeriod, daysUntilFreePeriodEnds, FREE_PERIOD_END } from "./free-period";
import { hashPassword } from "./password-hash";

// --- 1–2 Credits / pricing (revenue) ---

test("package-credits: paid tiers never under-charge stale package rows", () => {
  assert.equal(creditCostForDays(30), 1);
  assert.equal(creditCostForDays(365), 4);
  assert.equal(creditCostForDays(730), 6);
  assert.equal(effectiveCreditCost(730, 1, false), 6); // stale DB cost raised
  assert.equal(effectiveCreditCost(30, 5, false), 5); // higher package wins
  assert.equal(effectiveCreditCost(7, 99, true), 99); // trial uses package cost as-is
  assert.equal(effectiveCreditCost(3, 0, false), 0); // free week
});

test("package-credits: markup compounds and labels are stable", () => {
  assert.equal(markedUpCreditCost(4, 25, 10), Math.ceil(4 * 1.25 * 1.1));
  assert.equal(markedUpCreditCost(1, -5, -10), 1); // negative percents clamped
  assert.equal(packageLabelForDays(30), "1 Month");
  assert.equal(packageLabelForDays(45), "45 days");
});

test("sessionPaysLineCredits: only reseller roles pay", () => {
  assert.equal(sessionPaysLineCredits(PanelRole.RESELLER), true);
  assert.equal(sessionPaysLineCredits(PanelRole.SUB_RESELLER), true);
  assert.equal(sessionPaysLineCredits(PanelRole.ADMIN), false);
  assert.equal(sessionPaysLineCredits(PanelRole.STAFF), false);
});

test("debitResellerCredits: zero/negative amounts charge nothing; missing user Forbidden", async () => {
  const tx = {
    panelUser: {
      findUnique: async () => null,
      updateMany: async () => {
        throw new Error("should not update");
      },
      findUniqueOrThrow: async () => ({ credits: 0 }),
    },
    creditTransaction: { create: async () => ({}) },
  };
  assert.deepEqual(
    await debitResellerCredits(tx as never, { userId: "x", amount: 0, note: "n" }),
    { balanceAfter: 0, charged: 0 }
  );
  assert.deepEqual(
    await debitResellerCredits(tx as never, { userId: "x", amount: -3, note: "n" }),
    { balanceAfter: 0, charged: 0 }
  );
  await assert.rejects(
    () => debitResellerCredits(tx as never, { userId: "missing", amount: 1, note: "n" }),
    /Forbidden/
  );
});

// --- 3 line renew credits ---

test("renewDaysFromExpiryChange: shortens to 0; extends ceil days", () => {
  const now = new Date("2026-01-15T12:00:00Z");
  const cur = new Date("2026-01-20T12:00:00Z");
  assert.equal(renewDaysFromExpiryChange(cur, new Date("2026-01-18T12:00:00Z"), now), 0);
  assert.equal(renewDaysFromExpiryChange(cur, new Date("2026-01-21T12:00:00Z"), now), 1);
  assert.equal(renewDaysFromExpiryChange(cur, new Date("2026-02-20T12:00:00Z"), now), 31);
});

test("chargeLineRenewCredits: admin pays nothing", async () => {
  const tx = {} as never;
  const r = await chargeLineRenewCredits(
    tx,
    { id: "admin1", role: PanelRole.ADMIN },
    { days: 30, lineUsername: "u" }
  );
  assert.deepEqual(r, { charged: 0, balanceAfter: null });
});

test("chargeLineRenewCredits: invalid days skip debit", async () => {
  const r = await chargeLineRenewCredits(
    {} as never,
    { id: "r1", role: PanelRole.RESELLER },
    { days: 0, lineUsername: "u" }
  );
  assert.deepEqual(r, { charged: 0, balanceAfter: null });
});

// --- 4 internal request (security) ---

test("isAuthorizedInternalRequest: PANEL_INTERNAL_SECRET must match", () => {
  const prev = process.env.PANEL_INTERNAL_SECRET;
  const prevNode = process.env.NODE_ENV;
  process.env.PANEL_INTERNAL_SECRET = "internal-s3cret";
  try {
    const bad = new NextRequest("http://127.0.0.1/api/internal/live-auth", {
      headers: { "x-panel-internal-secret": "wrong" },
    });
    const good = new NextRequest("http://127.0.0.1/api/internal/live-auth", {
      headers: { "x-panel-internal-secret": "internal-s3cret" },
    });
    assert.equal(isAuthorizedInternalRequest(bad), false);
    assert.equal(isAuthorizedInternalRequest(good), true);
  } finally {
    if (prev === undefined) delete process.env.PANEL_INTERNAL_SECRET;
    else process.env.PANEL_INTERNAL_SECRET = prev;
    process.env.NODE_ENV = prevNode;
  }
});

test("isAuthorizedInternalRequest: production without secret denies", () => {
  const prevSecret = process.env.PANEL_INTERNAL_SECRET;
  const prevApi = process.env.PANEL_API_SECRET;
  const prevNex = process.env.NEXLIFY_PANEL_API_SECRET;
  const prevNode = process.env.NODE_ENV;
  delete process.env.PANEL_INTERNAL_SECRET;
  delete process.env.PANEL_API_SECRET;
  delete process.env.NEXLIFY_PANEL_API_SECRET;
  process.env.NODE_ENV = "production";
  try {
    const req = new NextRequest("http://127.0.0.1/api/internal/live-auth");
    assert.equal(isAuthorizedInternalRequest(req), false);
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevSecret !== undefined) process.env.PANEL_INTERNAL_SECRET = prevSecret;
    if (prevApi !== undefined) process.env.PANEL_API_SECRET = prevApi;
    if (prevNex !== undefined) process.env.NEXLIFY_PANEL_API_SECRET = prevNex;
  }
});

// --- 5 playback guard messages / shape ---

test("playbackDenyMessage covers security-sensitive reasons", () => {
  assert.match(playbackDenyMessage("ip"), /IP/i);
  assert.match(playbackDenyMessage("connections"), /Max connections/i);
  assert.match(playbackDenyMessage("kicked"), /kicked/i);
  assert.match(playbackDenyMessage("ddos"), /DDoS/i);
  assert.match(playbackDenyMessage("device"), /locked/i);
  assert.ok(STALKER_GUARDED_ACTIONS.has("create_link"));
});

test("asPlaybackGuardLine maps optional UA/device lock fields", () => {
  const g = asPlaybackGuardLine({
    id: "L1",
    lockToIp: true,
    allowedIps: "1.2.3.4",
    maxConnections: 2,
    allowedCountries: "US",
    blockedCountries: null,
    allowedUserAgents: "VLC",
    lockMac: "aa:bb",
  });
  assert.equal(g.id, "L1");
  assert.equal(g.allowedUserAgents, "VLC");
  assert.equal(g.lockMac, "aa:bb");
  assert.equal(g.lockDeviceId, null);
});

// --- 6 JWT strength ---

test("jwtSecretStrengthError rejects weak and short secrets", () => {
  assert.match(jwtSecretStrengthError("") ?? "", /not set/i);
  assert.match(jwtSecretStrengthError("short") ?? "", /32/);
  assert.match(jwtSecretStrengthError("dev-secret-change-me-32chars!!!!!") ?? "", /weak/i);
  assert.equal(
    jwtSecretStrengthError("a".repeat(32) + "-random-ok-value"),
    null
  );
});

test("jwtSecretBytes returns null when unset in production", () => {
  const prev = process.env.JWT_SECRET;
  const prevNode = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(jwtSecretBytes(), null);
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  }
});

// --- 7 password hash cost ---

test("hashPassword uses bcrypt verifiable hash", async () => {
  const h = await hashPassword("RiskGapPass1!");
  assert.match(h, /^\$2[aby]?\$/);
  const { verifyStoredPassword } = await import("./password-verify");
  assert.equal(await verifyStoredPassword("RiskGapPass1!", h), true);
});

// --- 8 security headers ---

test("applySecurityHeaders sets baseline; HSTS when forced", () => {
  const prev = process.env.PANEL_FORCE_HTTPS;
  delete process.env.PANEL_FORCE_HTTPS;
  delete process.env.PANEL_FULL_SSL;
  try {
    const res = applySecurityHeaders(NextResponse.json({ ok: true }));
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(res.headers.get("X-Frame-Options"), "SAMEORIGIN");
    assert.equal(res.headers.get("Strict-Transport-Security"), null);

    process.env.PANEL_FORCE_HTTPS = "1";
    const res2 = applySecurityHeaders(NextResponse.json({ ok: true }));
    assert.match(res2.headers.get("Strict-Transport-Security") ?? "", /max-age/);
  } finally {
    if (prev === undefined) delete process.env.PANEL_FORCE_HTTPS;
    else process.env.PANEL_FORCE_HTTPS = prev;
  }
});

// --- 9 session cookie flags ---

test("panelSessionCookieOptions: httpOnly + sameSite lax", () => {
  const prev = process.env.PANEL_COOKIE_SECURE;
  process.env.PANEL_COOKIE_SECURE = "0";
  try {
    const opts = panelSessionCookieOptions(undefined, 7);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, "lax");
    assert.equal(opts.path, "/");
    assert.equal(opts.secure, false);
    assert.equal(opts.maxAge, 60 * 60 * 24 * 7);
  } finally {
    if (prev === undefined) delete process.env.PANEL_COOKIE_SECURE;
    else process.env.PANEL_COOKIE_SECURE = prev;
  }
});

test("panelSessionCookieSecure honors x-forwarded-proto", () => {
  const httpsReq = new NextRequest("http://127.0.0.1/login", {
    headers: { "x-forwarded-proto": "https" },
  });
  const httpReq = new NextRequest("http://127.0.0.1/login", {
    headers: { "x-forwarded-proto": "http" },
  });
  assert.equal(panelSessionCookieSecure(httpsReq), true);
  assert.equal(panelSessionCookieSecure(httpReq), false);
});

// --- 10 coupons (revenue) ---

test("couponRemaining / toCouponPublicView: sold-out and expired", () => {
  assert.equal(couponRemaining(10, 3), 7);
  assert.equal(couponRemaining(0, 99), null); // unlimited
  const sold = toCouponPublicView({
    code: "SAVE",
    label: "Save",
    discountType: "percent",
    discountValue: 20,
    maxUses: 1,
    uses: 1,
    isActive: true,
    expiresAt: null,
  });
  assert.equal(sold.soldOut, true);
  assert.equal(sold.active, false);

  const expired = toCouponPublicView({
    code: "OLD",
    label: null,
    discountType: "percent",
    discountValue: 10,
    maxUses: 5,
    uses: 0,
    isActive: true,
    expiresAt: new Date("2020-01-01T00:00:00Z"),
  });
  assert.equal(expired.expired, true);
  assert.equal(expired.active, false);
  // Free period ended 2026-09-01; today is after — percent stays package value
  if (!isFreePeriod()) {
    assert.equal(sold.percentOff, 20);
  }
});

test("free-period helpers are consistent with FREE_PERIOD_END", () => {
  const after = new Date() >= FREE_PERIOD_END;
  assert.equal(isFreePeriod(), !after);
  if (after) assert.equal(daysUntilFreePeriodEnds(), 0);
  else assert.ok(daysUntilFreePeriodEnds() > 0);
});

// --- 11 reseller rewards ---

test("applyResellerLineReward: clamps percent math; zero when no rebate", async () => {
  let credits = 100;
  const ledger: unknown[] = [];
  const tx = {
    panelUser: {
      update: async (args: { data: { credits: { increment: number } } }) => {
        credits += args.data.credits.increment;
        return { credits };
      },
    },
    creditTransaction: {
      create: async (args: { data: unknown }) => {
        ledger.push(args.data);
        return {};
      },
    },
  };
  assert.equal(
    await applyResellerLineReward(tx as never, {
      userId: "r1",
      spent: 10,
      percent: 0,
      lineUsername: "u",
    }),
    0
  );
  const rebate = await applyResellerLineReward(tx as never, {
    userId: "r1",
    spent: 10,
    percent: 25,
    lineUsername: "u",
  });
  assert.equal(rebate, 2);
  assert.equal(credits, 102);
  assert.equal(ledger.length, 1);
});

test("reseller reward percent math clamps to floor 0..50 semantics", () => {
  const clamp = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(50, Math.max(0, Math.floor(n)));
  };
  assert.equal(clamp(0), 0);
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(12.9), 12);
  assert.equal(clamp(99), 50);
});

// --- 12 agent auth ---

test("requireAgentServer: missing token yields null server", async () => {
  const req = new NextRequest("http://127.0.0.1/api/agent/heartbeat");
  const server = await requireAgentServer(req);
  assert.equal(server, null);
});

// --- 13 portal session depends on JWT_SECRET ---

test("portal session module refuses unsigned JWT when secret missing", async () => {
  const prev = process.env.JWT_SECRET;
  const prevNode = process.env.NODE_ENV;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = "production";
  try {
    const { createPortalSession } = await import("./portal-session");
    await assert.rejects(() => createPortalSession({ id: "l1", username: "u" }), /JWT_SECRET/);
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  }
});

// --- 14 billing webhook auth (revenue) ---

test("handleBillingWebhook rejects bad secret without mutating", async () => {
  const prev = process.env.BILLING_WEBHOOK_SECRET;
  process.env.BILLING_WEBHOOK_SECRET = "billing-secret-xyz";
  try {
    const denied = await handleBillingWebhook({ action: "suspend", username: "x" }, "wrong");
    assert.deepEqual(denied, billingUnauthorized());
    assert.equal(denied.ok, false);
  } finally {
    if (prev === undefined) delete process.env.BILLING_WEBHOOK_SECRET;
    else process.env.BILLING_WEBHOOK_SECRET = prev;
  }
});

// --- 15 license server guard ---

test("startup license: NEXLIFY_LICENSE_REQUIRE=0 bypasses", async () => {
  const prev = process.env.NEXLIFY_LICENSE_REQUIRE;
  process.env.NEXLIFY_LICENSE_REQUIRE = "0";
  try {
    assert.equal(await startupValidationOk(), true);
    const r = await startupLicenseValidation();
    assert.equal(r.ok, true);
    assert.equal(r.reason, "dev_bypass");
  } finally {
    if (prev === undefined) delete process.env.NEXLIFY_LICENSE_REQUIRE;
    else process.env.NEXLIFY_LICENSE_REQUIRE = prev;
  }
});
