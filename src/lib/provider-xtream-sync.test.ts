import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultProviderSyncKind } from "./provider-xtream-sync";

describe("defaultProviderSyncKind", () => {
  it("defaults xtream_vod providers to MOVIE so XCIPTV gets new titles", () => {
    assert.equal(defaultProviderSyncKind("xtream_vod"), "MOVIE");
    assert.equal(defaultProviderSyncKind("live_upstream"), "LIVE");
    assert.equal(defaultProviderSyncKind(null), "LIVE");
  });
});
