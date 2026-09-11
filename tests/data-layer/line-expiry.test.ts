/**
 * Data-layer: line expiry boundaries, UTC day math, DST-safe extend.
 */
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { LineStatus } from "@prisma/client";
import { effectiveLineStatus, lineIsPlayable } from "../../src/lib/lines.ts";
import { computeExtendedExpiry } from "../../src/lib/line-renew.ts";

describe("line expiry boundaries", () => {
  it("exact second: expiresAt === now remains ACTIVE; 1ms later EXPIRED", () => {
    const nowMs = Date.parse("2026-09-10T12:00:00.000Z");
    mock.timers.enable({ apis: ["Date"], now: nowMs });
    try {
      const atExact = {
        status: LineStatus.ACTIVE,
        expiresAt: new Date(nowMs),
      };
      assert.equal(effectiveLineStatus(atExact), LineStatus.ACTIVE);
      assert.equal(lineIsPlayable(atExact), true);

      mock.timers.setTime(nowMs + 1);
      assert.equal(effectiveLineStatus(atExact), LineStatus.EXPIRED);
      assert.equal(lineIsPlayable(atExact), false);
    } finally {
      mock.timers.reset();
    }
  });

  it("timezone: comparisons use absolute Date ms (UTC store), not local calendar strings", () => {
    // Expiry stored as UTC instant; "local evening" vs "UTC morning" must not flip status.
    const expiresAt = new Date("2026-01-15T00:00:00.000Z");
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-01-14T23:59:59.000Z") });
    try {
      assert.equal(
        effectiveLineStatus({ status: LineStatus.ACTIVE, expiresAt }),
        LineStatus.ACTIVE
      );
      mock.timers.setTime(Date.parse("2026-01-15T00:00:00.001Z"));
      assert.equal(
        effectiveLineStatus({ status: LineStatus.ACTIVE, expiresAt }),
        LineStatus.EXPIRED
      );
    } finally {
      mock.timers.reset();
    }
  });

  it("DST: computeExtendedExpiry uses UTC calendar days across US spring-forward", () => {
    // 2026-03-08 US DST spring forward — UTC math must still add exactly 2 days.
    const now = new Date("2026-03-07T12:00:00.000Z");
    const current = new Date("2026-03-07T12:00:00.000Z");
    const next = computeExtendedExpiry(current, 2, now);
    assert.equal(next.toISOString(), "2026-03-09T12:00:00.000Z");
    assert.equal((next.getTime() - current.getTime()) / 86400000, 2);
  });

  it("DST: autumn fall-back still adds UTC days without local setDate drift", () => {
    const now = new Date("2026-10-31T12:00:00.000Z");
    const current = new Date("2026-10-31T12:00:00.000Z");
    const next = computeExtendedExpiry(current, 3, now);
    assert.equal(next.toISOString(), "2026-11-03T12:00:00.000Z");
  });

  it("expired/banned status stays non-playable even if expiresAt is future", () => {
    const future = new Date(Date.now() + 86400000);
    assert.equal(
      lineIsPlayable({ status: LineStatus.BANNED, expiresAt: future }),
      false
    );
    assert.equal(
      lineIsPlayable({ status: LineStatus.DISABLED, expiresAt: future }),
      false
    );
  });
});
