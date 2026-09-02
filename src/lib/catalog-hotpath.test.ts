import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import {
  CATALOG_TTL_MS,
  hashCatalogKey,
  lineBouquetCacheToken,
  writeGzipJsonArrayFile,
  catalogFileIsUsable,
  catalogFileIsFresh,
} from "./catalog-disk-cache";
import { memoryCacheWouldStore, MEMORY_CACHE_MAX_BYTES } from "./cache";
import { iterateXmltvPrograms, parseXmltvPrograms } from "./epg";

describe("catalog disk cache", () => {
  it("treats any complete blob as usable so Update Content is not blocked on rebuild", () => {
    assert.equal(catalogFileIsUsable(0), true);
    assert.equal(catalogFileIsUsable(10 * 60 * 1000), true);
    assert.equal(catalogFileIsUsable(3 * 60 * 60 * 1000), true);
    assert.equal(catalogFileIsUsable(null), false);
    assert.equal(catalogFileIsFresh(CATALOG_TTL_MS - 1), true);
    assert.equal(catalogFileIsFresh(CATALOG_TTL_MS), false);
  });

  it("does not delete in-flight .tmp files when purging catalog cache", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nexlify-purge-"));
    const prev = process.env.NEXLIFY_CATALOG_CACHE_DIR;
    process.env.NEXLIFY_CATALOG_CACHE_DIR = dir;
    try {
      const { purgeCatalogDiskCache } = await import("./catalog-disk-cache");
      await writeFile(join(dir, "xtream-live-x.json.gz"), "gz");
      await writeFile(join(dir, "xtream-live-x.json.gz.1.tmp"), "tmp");
      await purgeCatalogDiskCache();
      const left = await readdir(dir);
      assert.equal(left.includes("xtream-live-x.json.gz.1.tmp"), true);
      assert.equal(left.includes("xtream-live-x.json.gz"), false);
    } finally {
      if (prev == null) delete process.env.NEXLIFY_CATALOG_CACHE_DIR;
      else process.env.NEXLIFY_CATALOG_CACHE_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hashes bouquet tokens stably", () => {
    assert.equal(lineBouquetCacheToken(["b", "a"]), lineBouquetCacheToken(["a", "b"]));
    assert.equal(hashCatalogKey(["v7", "live"]), hashCatalogKey(["v7", "live"]));
    assert.notEqual(hashCatalogKey(["v7", "live"]), hashCatalogKey(["v7", "vod"]));
  });

  it("writes a gzip JSON array without keeping the source array", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nexlify-cat-"));
    const dest = join(dir, "t.json.gz");
    try {
      await writeGzipJsonArrayFile(dest, async (writeItem) => {
        await writeItem({ n: 1 });
        await writeItem({ n: 2 });
      });
      const raw = gunzipSync(await readFile(dest)).toString("utf8");
      assert.equal(raw, '[{"n":1},{"n":2}]');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("in-memory cache guard", () => {
  it("refuses catalog-sized values", () => {
    assert.equal(memoryCacheWouldStore(100), true);
    assert.equal(memoryCacheWouldStore(MEMORY_CACHE_MAX_BYTES), true);
    assert.equal(memoryCacheWouldStore(MEMORY_CACHE_MAX_BYTES + 1), false);
  });
});

describe("xmltv programme iterator", () => {
  it("yields programmes without requiring a full in-memory map", () => {
    const xml = `
      <tv>
        <programme start="20250819220000 +0000" stop="20250819223000 +0000" channel="bbc">
          <title>News</title>
        </programme>
        <programme start="20250819223000 +0000" stop="20250819230000 +0000" channel="bbc">
          <title>Weather</title>
        </programme>
      </tv>
    `;
    const rows = parseXmltvPrograms(xml, "src1");
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.title, "News");
    assert.equal([...iterateXmltvPrograms(xml, "src1")].length, 2);
  });
});
