import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldKeepStickyLineLb } from "./server-load";
import {
  collectMainMediaHostPool,
  directMediaHostnameForServer,
  directMediaOriginForServerSync,
  parseStreamServerDomain,
  pickAdvertisedMediaHostnameSync,
} from "./stream-server-domain";
import { exportPlaybackUrl, magHttpPlaybackOrigin } from "./export-playback-url";
import { StreamType } from "@prisma/client";

describe("stream server domain validation", () => {
  it("accepts and normalizes one LB hostname", () => {
    assert.deepEqual(parseStreamServerDomain("lb2.stream.example.com", "lb"), {
      ok: true,
      domain: "lb2.stream.example.com",
    });
    assert.deepEqual(parseStreamServerDomain("https://DarkCDN.site/path", "lb"), {
      ok: true,
      domain: "darkcdn.site",
    });
    assert.deepEqual(parseStreamServerDomain("", "lb"), { ok: true, domain: null });
  });

  it("rejects comma-separated domains on LB role", () => {
    const multi = parseStreamServerDomain("a.example.com,b.example.com", "lb");
    assert.equal(multi.ok, false);
    const spaced = parseStreamServerDomain("a.example.com b.example.com", "lb");
    assert.equal(spaced.ok, false);
  });

  it("allows multiple domains on main role", () => {
    assert.deepEqual(parseStreamServerDomain("a.example.com, b.example.com", "main"), {
      ok: true,
      domain: "a.example.com,b.example.com",
    });
  });

  it("rejects invalid hostnames", () => {
    const bad = parseStreamServerDomain("not a domain!!", "lb");
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

  it("uses main multi-domain pool when LB has no domain", () => {
    assert.equal(
      pickAdvertisedMediaHostnameSync({
        lbHost: "209.237.141.15",
        lbDomain: null,
        mainPoolHosts: ["cdn1.example.com", "cdn2.example.com"],
        lineId: "line-a",
        panelHost: "45.88.138.18",
      }),
      "cdn1.example.com"
    );
    assert.equal(
      collectMainMediaHostPool({
        host: "45.88.138.18",
        domain: "darkcdn.store,stream.darkcdn.store",
        dnsRotator: { mode: "round_robin", hosts: ["cdn1.example.com"] },
      }).sort().join(","),
      "cdn1.example.com,darkcdn.store,stream.darkcdn.store"
    );
  });

  it("never advertises the panel IP when an LB host exists", () => {
    assert.equal(
      pickAdvertisedMediaHostnameSync({
        lbHost: "209.237.141.15",
        lbDomain: null,
        mainPoolHosts: ["45.88.138.18"],
        panelHost: "45.88.138.18",
      }),
      "209.237.141.15"
    );
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

    assert.match(live, /^http:\/\/darkcdn\.site\//);
    assert.doesNotMatch(live, /45\.88\.138\.18/);
  });
});
