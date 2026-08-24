import assert from "node:assert/strict";
import { test } from "node:test";
import { displayStreamIcon, plexArtworkPath, plexArtworkUrl } from "./plex-artwork";

test("plexArtworkPath is a same-origin artwork route", () => {
  assert.equal(plexArtworkPath("abc", "123"), "/api/artwork/plex/abc/123");
});

test("plexArtworkUrl prefixes the public panel origin for IPTV apps", () => {
  assert.equal(
    plexArtworkUrl("abc", "123", "http://45.88.138.18"),
    "http://45.88.138.18/api/artwork/plex/abc/123"
  );
  assert.equal(plexArtworkUrl("abc", "123", ""), "/api/artwork/plex/abc/123");
});

test("displayStreamIcon uses the Plex artwork proxy for integration streams", () => {
  assert.equal(
    displayStreamIcon({
      streamUrl: "nexlify://plex/int1/999",
      streamIcon: "http://95.217.58.49:42400/library/metadata/999/thumb?X-Plex-Token=secret",
    }),
    "/api/artwork/plex/int1/999"
  );
  assert.equal(displayStreamIcon({ streamIcon: "https://cdn.example/p.jpg" }), "https://cdn.example/p.jpg");
  assert.equal(displayStreamIcon({}), null);
});
