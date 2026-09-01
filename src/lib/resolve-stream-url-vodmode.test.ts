import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listStreamPlaybackUrls, syncVodModeFields, type StreamWithProvider } from "./resolve-stream-url";

describe("syncVodModeFields", () => {
  it("keeps LIVE / ON_DEMAND / CATCHUP", () => {
    assert.deepEqual(syncVodModeFields({ vodMode: "LIVE" }), { isOnDemand: false, vodMode: "LIVE" });
    assert.deepEqual(syncVodModeFields({ vodMode: "ON_DEMAND" }), {
      isOnDemand: true,
      vodMode: "ON_DEMAND",
    });
    assert.deepEqual(syncVodModeFields({ vodMode: "CATCHUP" }), {
      isOnDemand: true,
      vodMode: "CATCHUP",
    });
  });

  it("maps legacy MOVIE/SERIES to ON_DEMAND", () => {
    assert.equal(syncVodModeFields({ vodMode: "MOVIE" }).vodMode, "ON_DEMAND");
    assert.equal(syncVodModeFields({ vodMode: "SERIES" }).vodMode, "ON_DEMAND");
  });

  it("prefers explicit vodMode over legacy isOnDemand", () => {
    assert.deepEqual(syncVodModeFields({ isOnDemand: true, vodMode: "LIVE" }), {
      isOnDemand: false,
      vodMode: "LIVE",
    });
    assert.deepEqual(syncVodModeFields({ isOnDemand: false, vodMode: "ON_DEMAND" }), {
      isOnDemand: true,
      vodMode: "ON_DEMAND",
    });
  });

  it("maps legacy isOnDemand-only updates", () => {
    assert.deepEqual(syncVodModeFields({ isOnDemand: true }), {
      isOnDemand: true,
      vodMode: "ON_DEMAND",
    });
    assert.deepEqual(syncVodModeFields({ isOnDemand: false }), {
      isOnDemand: false,
      vodMode: "LIVE",
    });
  });
});

describe("listStreamPlaybackUrls", () => {
  it("prefers XUI stream_source over a different hosted provider path", () => {
    const stream = {
      streamUrl: "https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/602",
      backupUrl: "http://zee-portal.xyz:80/ghostface/bHwC552glfki2026/238103",
      hostedExternally: true,
      providerPath: "17391",
      isOnDemand: true,
      vodMode: "ON_DEMAND",
      lastProbeOk: true,
      bitrates: null,
      playlistUrl: null,
      provider: {
        baseUrl: "http://tinypanel.info:8080",
        apiKey: null,
        providerType: "generic_url",
      },
    } as unknown as StreamWithProvider;
    const urls = listStreamPlaybackUrls(stream);
    assert.equal(urls[0], "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/602");
    assert.ok(urls.includes("http://zee-portal.xyz/ghostface/bHwC552glfki2026/238103"));
    assert.ok(urls.includes("http://tinypanel.info:8080/17391"));
  });
});
