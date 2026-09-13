import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastUntrustedHop, parseForwardedHops, resolveClientIp } from "./client-ip";

function headers(map: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    get(name: string) {
      return lower[name.toLowerCase()] ?? null;
    },
  };
}

describe("resolveClientIp AUTH-02", () => {
  it("prefers X-Real-IP over a spoofed first XFF hop", () => {
    assert.equal(
      resolveClientIp(
        headers({
          "x-real-ip": "203.0.113.50",
          "x-forwarded-for": "198.51.100.1, 203.0.113.50",
        })
      ),
      "203.0.113.50"
    );
  });

  it("uses the last XFF hop when X-Real-IP is missing", () => {
    assert.equal(
      resolveClientIp(headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.80" })),
      "203.0.113.80"
    );
  });

  it("does not return the first XFF hop when a later client hop exists", () => {
    assert.notEqual(
      resolveClientIp(headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.80" })),
      "198.51.100.1"
    );
  });

  it("skips infra and loopback hops from the right", () => {
    assert.equal(
      lastUntrustedHop(parseForwardedHops("203.0.113.9, 45.88.138.18, 127.0.0.1")),
      "203.0.113.9"
    );
  });

  it("ignores spoofable cf-connecting-ip when X-Real-IP is the client", () => {
    assert.equal(
      resolveClientIp(
        headers({
          "cf-connecting-ip": "198.51.100.9",
          "x-real-ip": "203.0.113.40",
          "x-forwarded-for": "198.51.100.9",
        })
      ),
      "203.0.113.40"
    );
  });

  it("strips ::ffff: and rejects empty/unknown", () => {
    assert.equal(resolveClientIp(headers({ "x-real-ip": "::ffff:203.0.113.7" })), "203.0.113.7");
    assert.equal(resolveClientIp(headers({ "x-forwarded-for": "unknown" })), undefined);
  });
});
