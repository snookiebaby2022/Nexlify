import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldGzipXmltv, xmltvWantsGzipFile } from "./xmltv-http";

describe("xmltv gzip", () => {
  it("never gzip-encodes XCIPTV/Smarters even when they send Accept-Encoding", () => {
    assert.equal(shouldGzipXmltv("gzip, deflate", "XCIPTV/5.0.0"), false);
    assert.equal(shouldGzipXmltv("gzip", "IPTVSmartersPlayer"), false);
    assert.equal(shouldGzipXmltv("", "XCIPTV/5.0.0"), false);
  });

  it("gzips browsers that opt in via Accept-Encoding", () => {
    assert.equal(shouldGzipXmltv("gzip, deflate, br", "Mozilla/5.0"), true);
    assert.equal(shouldGzipXmltv("", "Mozilla/5.0"), false);
  });

  it("treats type=gzip as an Xtream gzip file download", () => {
    assert.equal(xmltvWantsGzipFile("gzip"), true);
    assert.equal(xmltvWantsGzipFile("gz"), true);
    assert.equal(xmltvWantsGzipFile(null), false);
    assert.equal(shouldGzipXmltv("", "XCIPTV/5.0.0", "gzip"), true);
  });
});
