import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairMalformedStreamUrl, normalizeStreamSource } from "./stream-source";

describe("repairMalformedStreamUrl", () => {
  it("fixes missing scheme with stray colon path", () => {
    assert.equal(
      repairMalformedStreamUrl("://junki3monk3y.com:/Blade2nd/PaaJhvNbqX/56209"),
      "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/56209"
    );
  });

  it("normalizes https host:443 slash path", () => {
    assert.equal(
      repairMalformedStreamUrl("https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/56209"),
      "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/56209"
    );
  });

  it("runs inside normalizeStreamSource", () => {
    assert.equal(normalizeStreamSource("://example.com:/live/a/b"), "https://example.com/live/a/b");
  });
});
