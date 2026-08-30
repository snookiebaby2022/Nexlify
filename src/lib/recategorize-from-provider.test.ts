import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  streamBelongsToProvider,
  urlHostKey,
  xtreamStreamIdFromUrl,
} from "./recategorize-from-provider";
import { literalLiveNameKey } from "./stream-duplicates";

describe("xtreamStreamIdFromUrl", () => {
  it("reads the numeric id from a provider live URL", () => {
    assert.equal(
      xtreamStreamIdFromUrl("https://nowtvgo.online/live/Ghostface/Mb27ThBWTH/5631944.ts"),
      "5631944"
    );
    assert.equal(xtreamStreamIdFromUrl("http://x96.pro:8880/live/u/p/12.m3u8"), "12");
    assert.equal(xtreamStreamIdFromUrl("https://example.com/movie/u/p/9.mp4"), "9");
    assert.equal(xtreamStreamIdFromUrl("https://example.com/live"), null);
  });
});

describe("literalLiveNameKey", () => {
  it("keeps HD, SD, +1, and HEVC as different names", () => {
    assert.notEqual(literalLiveNameKey("BBC One HD"), literalLiveNameKey("BBC One SD"));
    assert.notEqual(literalLiveNameKey("BBC One HD"), literalLiveNameKey("BBC One FHD"));
    assert.notEqual(literalLiveNameKey("Channel 5 SD"), literalLiveNameKey("Channel 5 +1 SD"));
    assert.notEqual(
      literalLiveNameKey("BBC One HEVC HB (1080p)"),
      literalLiveNameKey("BBC One HD")
    );
    assert.equal(literalLiveNameKey("BBC One HD"), literalLiveNameKey("  bbc   one  hd "));
  });
});

describe("streamBelongsToProvider", () => {
  it("never lets another providerId steal a stream", () => {
    assert.equal(
      streamBelongsToProvider(
        { providerId: "optv", streamUrl: "http://other.example/live/u/p/1.ts" },
        "ghostface",
        "other.example"
      ),
      false
    );
    assert.equal(
      streamBelongsToProvider(
        { providerId: "ghostface", streamUrl: "http://nowtvgo.online/live/u/p/1.ts" },
        "ghostface",
        "nowtvgo.online"
      ),
      true
    );
  });

  it("only uses URL host when providerId is empty", () => {
    assert.equal(urlHostKey("https://nowtvgo.online:8080/live/u/p/1.ts"), "nowtvgo.online");
    assert.equal(
      streamBelongsToProvider(
        { providerId: null, streamUrl: "https://nowtvgo.online/live/u/p/1.ts" },
        "ghostface",
        "nowtvgo.online"
      ),
      true
    );
    assert.equal(
      streamBelongsToProvider(
        { providerId: null, streamUrl: "https://other.example/live/u/p/1.ts" },
        "ghostface",
        "nowtvgo.online"
      ),
      false
    );
  });
});
