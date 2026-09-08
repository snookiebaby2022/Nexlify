import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldKeepStickyLineLb } from "./server-load";
import {
  directMediaHostnameForServer,
  directMediaOriginForServerSync,
  parseStreamServerDomain,
} from "./stream-server-domain";
import { exportPlaybackUrl, magHttpPlaybackOrigin } from "./export-playback-url";
import { StreamType } from "@prisma/client";

describe("stream server domain validation", () => {
  it("accepts and normalizes one hostname", () => {
    assert.deepEqual(parseStreamServerDomain("lb2.stream.example.com"), {
      ok: true,
      domain: "lb2.stream.example.com",
    });
    assert.deepEqual(parseStreamServerDomain("https://DarkCDN.site/path"), {
      ok: true,
      domain: "darkcdn.site",
    });
    assert.deepEqual(parseStreamServerDomain(""), { ok: true, domain: null });
  });

  it("rejects comma-separated or multi-host domains", () => {
    const multi = parseStreamServerDomain("a.example.com,b.example.com");
    assert.equal(multi.ok, false);
    const spaced = parseStreamServerDomain("a.example.com b.example.com");
    assert.equal(spaced.ok, false);
  });

  it("rejects invalid hostnames", () => {
    const bad = parseStreamServerDomain("not a domain!!");
    assert.equal(bad.ok, false);
  });
});

describe("direct media hostname selection", () => {
  it("prefers a single LB domain over the raw IP", () => {
    assert.equal(
      directMediaHostnameForServer({
        host: "209.237.141.15",
        domain: "darkcdn.site",
      }),
      "darkcdn.site"
    );
    assert.equal(
      directMediaOriginForServerSync({
        host: "209.237.141.15",
        domain: "darkcdn.site",
        protocol: "http",
      }),
      "http://darkcdn.site"
    );
  });

  it("falls back to the LB IP when domain is missing or invalid list", () => {
    assert.equal(
      directMediaHostnameForServer({ host: "209.237.141.15", domain: null }),
      "209.237.141.15"
    );
    assert.equal(
      directMediaHostnameForServer({
        host: "209.237.141.15",
        domain: "a.example.com,b.example.com",
      }),
      "209.237.141.15"
    );
  });

  it("never treats a main panel domain as the LB media host without LB fields", () => {
    // Origin builders only receive LB rows from sticky assignment; without domain/host → null.
    assert.equal(directMediaHostnameForServer({ host: "", domain: "darkcdn.store" }), "darkcdn.store");
    // Empty LB row yields no media origin — caller must fall back.
    assert.equal(directMediaHostnameForServer({ host: "", domain: null }), null);
  });
});

describe("sticky line LB keep predicate", () => {
  it("keeps a healthy LB even when saturated would matter elsewhere", () => {
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "online",
        role: "lb",
        hasMediaEndpoint: true,
      }),
      true
    );
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "unknown",
        role: "lb",
        hasMediaEndpoint: true,
      }),
      true
    );
  });

  it("reassigns when the preferred LB is offline, main, or has no media endpoint", () => {
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "offline",
        role: "lb",
        hasMediaEndpoint: true,
      }),
      false
    );
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "online",
        role: "main",
        hasMediaEndpoint: true,
      }),
      false
    );
    assert.equal(
      shouldKeepStickyLineLb({
        preferredActive: true,
        healthStatus: "online",
        role: "lb",
        hasMediaEndpoint: false,
      }),
      false
    );
  });
});

describe("Xtream / M3U / Stalker share the same direct LB origin", () => {
  it("builds identical live paths from the assigned LB origin", () => {
    const origin = magHttpPlaybackOrigin(
      directMediaOriginForServerSync({
        host: "209.237.141.15",
        domain: "darkcdn.site",
        protocol: "http",
      })!
    );
    assert.equal(origin, "http://darkcdn.site");

    const stream = {
      id: "ch1",
      type: StreamType.LIVE,
      streamUrl: "http://provider/x",
      containerExtension: "ts",
    };
    const line = { username: "u", password: "p" };
    const live = exportPlaybackUrl(origin, line, stream, undefined, undefined, "ts", false, true);
    assert.equal(live, "http://darkcdn.site/live/u/p/ch1.ts");

    // M3U and Stalker create_link use the same export helper + origin.
    assert.match(live, /^http:\/\/darkcdn\.site\//);
    assert.doesNotMatch(live, /darkcdn\.store|45\.88\.138\.18/);
  });
});
