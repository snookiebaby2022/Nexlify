import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeEpgToken, epgNameSimilarity, findBestEpgMatch } from "./epg-auto-match";

describe("epg-auto-match", () => {
  it("normalizes channel tokens", () => {
    assert.equal(normalizeEpgToken("BBC One HD"), "bbcone");
    assert.equal(normalizeEpgToken("Sky Sports FHD"), "skysports");
  });

  it("scores exact and fuzzy names", () => {
    assert.equal(epgNameSimilarity("BBC One", "BBC One"), 1);
    assert.ok(epgNameSimilarity("BBC One HD", "BBC One") >= 0.9);
  });

  it("finds best match from candidates", () => {
    const match = findBestEpgMatch("Sky Sports Main Event", [
      { id: "sky.sports.main.event", displayName: "Sky Sports Main Event" },
      { id: "bbc.one", displayName: "BBC One" },
    ]);
    assert.ok(match);
    assert.equal(match!.epgChannelId, "sky.sports.main.event");
  });
});
