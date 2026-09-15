import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StreamType } from "@prisma/client";
import { mapXtreamVodItem } from "./xtream-catalog-items";
import type { CanonicalCategoryMaps } from "./xtream-category-canonical";

const canonical: CanonicalCategoryMaps = {
  numericByCategoryId: new Map([["cat1", "12"]]),
  byMergeKey: new Map([
    [
      "movies",
      { categoryId: "cat1", name: "Movies", numericId: "12", mergeKey: "movies" },
    ],
  ]),
  cuidsByNumericId: new Map([["12", ["cat1"]]]),
};

describe("mapXtreamVodItem lean listing", () => {
  it("does not repeat icon URL in movie_image or emit empty sid/source keys", () => {
    const item = mapXtreamVodItem(
      {
        id: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
        name: "Test Movie",
        type: StreamType.MOVIE,
        streamIcon: "https://cdn.example/poster.jpg",
        streamUrl: "https://cdn.example/movie.mp4",
        containerExtension: "mp4",
        isAdult: false,
        categoryId: "cat1",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-06-01T00:00:00Z"),
        vodRating: null,
        urlExt: null,
      } as never,
      0,
      canonical
    );
    assert.equal(item.stream_icon, "https://cdn.example/poster.jpg");
    assert.equal(item.movie_image, "");
    assert.equal("updated_at" in item, false);
    assert.equal("custom_sid" in item, false);
    assert.equal("direct_source" in item, false);
    assert.ok(item.last_modified);
  });
});
