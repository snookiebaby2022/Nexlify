import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldGzipXmltv, xmltvChannelIds, xmltvWantsGzipFile } from "./xmltv-http";

describe("xmltv gzip", () => {
  it("never HTTP-gzips xmltv, including XCIPTV and browsers", () => {
    assert.equal(shouldGzipXmltv("gzip, deflate", "XCIPTV/5.0.0"), false);
    assert.equal(shouldGzipXmltv("gzip", "IPTVSmartersPlayer"), false);
    assert.equal(shouldGzipXmltv("", "XCIPTV/5.0.0"), false);
    assert.equal(shouldGzipXmltv("gzip, deflate, br", "Mozilla/5.0"), false);
    assert.equal(shouldGzipXmltv("", "Mozilla/5.0"), false);
  });

  it("treats type=gzip as an Xtream gzip file download", () => {
    assert.equal(xmltvWantsGzipFile("gzip"), true);
    assert.equal(xmltvWantsGzipFile("gz"), true);
    assert.equal(xmltvWantsGzipFile(null), false);
    assert.equal(shouldGzipXmltv("", "XCIPTV/5.0.0", "gzip"), true);
  });
});

describe("xmltv channel ids", () => {
  it("emits epg id plus numeric Xtream stream_id for XCIPTV matching", () => {
    const ids = xmltvChannelIds("BBC1.uk", "clxyz123");
    assert.ok(ids.includes("BBC1.uk"));
    assert.equal(ids.length, 2);
    assert.match(ids[1]!, /^\d+$/);
  });

  it("includes channel_id when it differs from epg id", () => {
    const ids = xmltvChannelIds("BBC1.uk", "clxyz123", "bbc.one");
    assert.deepEqual(ids.slice(0, 2), ["BBC1.uk", "bbc.one"]);
    assert.match(ids[2]!, /^\d+$/);
  });
});
