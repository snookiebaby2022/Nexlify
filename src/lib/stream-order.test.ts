import assert from "node:assert/strict";
import { test } from "node:test";
import { StreamType } from "@prisma/client";
import { listVodNewestFirst, streamListOrderBy } from "./stream-order";

test("listVodNewestFirst is true for movies and series only", () => {
  assert.equal(listVodNewestFirst(StreamType.MOVIE), true);
  assert.equal(listVodNewestFirst(StreamType.SERIES), true);
  assert.equal(listVodNewestFirst([StreamType.MOVIE, StreamType.SERIES]), true);
  assert.equal(listVodNewestFirst(StreamType.LIVE), false);
  assert.equal(listVodNewestFirst([StreamType.LIVE, StreamType.MOVIE]), false);
  assert.equal(listVodNewestFirst(null), false);
  assert.equal(listVodNewestFirst([]), false);
});

test("streamListOrderBy defaults to newest createdAt", () => {
  assert.deepEqual(streamListOrderBy(), [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(streamListOrderBy("newest"), [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(streamListOrderBy("order"), [{ sortOrder: "asc" }, { name: "asc" }]);
  assert.deepEqual(streamListOrderBy("name"), [{ sortOrder: "asc" }, { name: "asc" }]);
});
