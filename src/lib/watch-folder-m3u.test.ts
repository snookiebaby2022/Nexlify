import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildXtreamM3uUrl, isLocalM3uPath, planWatchFolderM3uReview } from "./watch-folder-m3u";
import type { M3uEntry } from "./m3u-parser";

describe("isLocalM3uPath", () => {
  it("accepts a server .m3u file and rejects URLs and folders", () => {
    assert.equal(isLocalM3uPath("/media/uk.m3u"), true);
    assert.equal(isLocalM3uPath("C:\\lists\\uk.m3u8"), true);
    assert.equal(isLocalM3uPath("https://host/get.php?type=m3u_plus"), false);
    assert.equal(isLocalM3uPath("/media/vod/movies"), false);
  });
});

describe("buildXtreamM3uUrl", () => {
  it("builds a get.php m3u_plus URL", () => {
    assert.equal(
      buildXtreamM3uUrl("host.example:8080", "user", "pass"),
      "http://host.example:8080/get.php?username=user&password=pass&type=m3u_plus&output=ts"
    );
  });
});

describe("planWatchFolderM3uReview", () => {
  const live = (name: string, url: string, group = "UK | Entertainment"): M3uEntry => ({
    name,
    url,
    group,
    tvgName: name,
  });

  it("counts adds, keeps, renames, moves, and scoped exact-name copies", () => {
    const review = planWatchFolderM3uReview(
      [
        live("BBC One HD", "http://p/1.ts"),
        live("ITV1 HD", "http://p/2.ts"),
        live("Channel 4 HD", "http://p/3.ts", "UK | Entertainment"),
        live("Sky News", "http://p/4.ts", "UK | News"),
        live("Sky News", "http://p/5.ts", "UK | News"),
      ],
      [
        { streamUrl: "http://p/2.ts", name: "ITV HD", categoryName: "UK | Entertainment" },
        { streamUrl: "http://p/3.ts", name: "Channel 4 HD", categoryName: "UK | Entertainment" },
        { streamUrl: "http://p/4.ts", name: "Sky News", categoryName: "UK | Entertainment" },
        { streamUrl: "http://p/5.ts", name: "Sky News", categoryName: "UK | Entertainment" },
      ],
      { type: "LIVE", removeDuplicates: true }
    );
    assert.equal(review.add, 1);
    assert.equal(review.rename, 1);
    assert.equal(review.keep, 1);
    assert.equal(review.move, 2);
    assert.equal(review.dedupe, 1);
    assert.equal(review.entries, 5);
    assert.ok(review.samples.some((s) => s.action === "add" && s.name === "BBC One HD"));
    assert.ok(review.samples.some((s) => s.action === "rename" && s.nextName === "ITV1 HD"));
    assert.ok(review.samples.some((s) => s.action === "move" && s.toFolder === "UK | News"));
  });

  it("does not move folders when overwrite is off", () => {
    const review = planWatchFolderM3uReview(
      [live("Sky News", "http://p/4.ts", "UK | News")],
      [{ streamUrl: "http://p/4.ts", name: "Sky News", categoryName: "UK | Entertainment" }],
      { type: "LIVE", overwriteCategories: false }
    );
    assert.equal(review.move, 0);
    assert.equal(review.keep, 1);
  });
});
