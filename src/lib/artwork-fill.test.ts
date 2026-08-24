import assert from "node:assert/strict";
import { test } from "node:test";
import {
  artworkNameKey,
  pickProviderArtwork,
  xtreamRemoteContentId,
  type ProviderArtworkIndex,
} from "./provider-remote-catalog";

function emptyIndex(over: Partial<ProviderArtworkIndex> = {}): ProviderArtworkIndex {
  return {
    byId: new Map(),
    byName: new Map(),
    hostToProviderIds: new Map(),
    ...over,
  };
}

test("xtreamRemoteContentId reads live/movie/series playback paths", () => {
  assert.equal(
    xtreamRemoteContentId("http://prov.example:8080/movie/user/pass/17391.mp4"),
    "17391"
  );
  assert.equal(
    xtreamRemoteContentId("http://prov.example/live/user/pass/88.ts"),
    "88"
  );
  assert.equal(
    xtreamRemoteContentId("https://prov.example/series/u/p/9.mkv?token=1"),
    "9"
  );
  assert.equal(xtreamRemoteContentId("nexlify://plex/abc/1"), null);
});

test("artworkNameKey strips year and quality tags in brackets", () => {
  assert.equal(artworkNameKey("Skyfall (2012) [1080p]"), "skyfall");
  assert.equal(artworkNameKey("Skyfall"), "skyfall");
});

test("pickProviderArtwork uses provider path then host+id, not a random provider", () => {
  const index = emptyIndex({
    byId: new Map([
      ["provA:17391", "https://cdn.example/a.jpg"],
      ["provB:17391", "https://cdn.example/b.jpg"],
    ]),
    byName: new Map([["provA:skyfall", "https://cdn.example/name.jpg"]]),
    hostToProviderIds: new Map([["prov.example", ["provA"]]]),
  });

  assert.equal(
    pickProviderArtwork(index, {
      name: "Skyfall (2012)",
      providerId: "provA",
      providerPath: "17391",
      streamUrl: "http://other.example/movie/u/p/17391.mp4",
    }),
    "https://cdn.example/a.jpg"
  );

  assert.equal(
    pickProviderArtwork(index, {
      name: "Skyfall (2012)",
      providerId: null,
      providerPath: null,
      streamUrl: "http://prov.example/movie/u/p/17391.mp4",
    }),
    "https://cdn.example/a.jpg"
  );

  assert.equal(
    pickProviderArtwork(index, {
      name: "Unrelated",
      providerId: null,
      streamUrl: "http://unknown.example/movie/u/p/17391.mp4",
    }),
    null
  );
});
