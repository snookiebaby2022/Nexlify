import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkLineUserAgent,
  normalizeUserAgentField,
  parseUserAgentPatterns,
} from "./line-restrictions";

describe("parseUserAgentPatterns", () => {
  it("treats empty and JSON empty array as unrestricted", () => {
    assert.deepEqual(parseUserAgentPatterns(null), []);
    assert.deepEqual(parseUserAgentPatterns(""), []);
    assert.deepEqual(parseUserAgentPatterns("[]"), []);
    assert.deepEqual(parseUserAgentPatterns("null"), []);
    assert.deepEqual(parseUserAgentPatterns("{}"), []);
  });

  it("parses JSON arrays and comma lists", () => {
    assert.deepEqual(parseUserAgentPatterns('["VLC","Smarters"]'), ["vlc", "smarters"]);
    assert.deepEqual(parseUserAgentPatterns("VLC, Smarters"), ["vlc", "smarters"]);
  });
});

describe("normalizeUserAgentField", () => {
  it("stores null for empty allow-lists", () => {
    assert.equal(normalizeUserAgentField("[]"), null);
    assert.equal(normalizeUserAgentField(""), null);
    assert.equal(normalizeUserAgentField('["VLC"]'), "VLC");
  });
});

describe("checkLineUserAgent", () => {
  it("allows any UA when allow-list is empty JSON array", () => {
    assert.equal(checkLineUserAgent({ allowedUserAgents: "[]" }, "IPTVSmarters/3.0"), true);
    assert.equal(checkLineUserAgent({ allowedUserAgents: null }, "VLC/3.0"), true);
  });

  it("enforces non-empty allow-list", () => {
    assert.equal(checkLineUserAgent({ allowedUserAgents: "VLC" }, "IPTVSmarters/3.0"), false);
    assert.equal(checkLineUserAgent({ allowedUserAgents: '["vlc"]' }, "VLC/3.0 LibVLC"), true);
  });

  it("allows LibVLC when line allows XCIPTV (built-in player)", () => {
    assert.equal(
      checkLineUserAgent({ allowedUserAgents: "XCIPTV" }, "VLC/3.0.20 LibVLC/3.0.20"),
      true
    );
    assert.equal(
      checkLineUserAgent({ allowedUserAgents: "xciptv" }, "ExoPlayerLib/2.11.3"),
      true
    );
    assert.equal(checkLineUserAgent({ allowedUserAgents: "VLC" }, "XCIPTV/5.0.0"), false);
  });

  it("blocks disallowed patterns", () => {
    assert.equal(
      checkLineUserAgent({ disallowedUserAgents: "curl" }, "curl/8.0"),
      false
    );
  });
});
