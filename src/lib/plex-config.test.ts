import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlexBaseUrl,
  extractPlexToken,
  normalizePlexConfig,
  parsePlexHostPort,
  plexImageRequestHeaders,
  plexRequestHeaders,
} from "./plex-config";

test("extractPlexToken accepts a raw token", () => {
  assert.equal(extractPlexToken("AbCdEfGhIjKlMnOpQrSt"), "AbCdEfGhIjKlMnOpQrSt");
});

test("extractPlexToken strips a pasted query string", () => {
  assert.equal(extractPlexToken("?X-Plex-Token=AbCdEfGhIjKlMnOpQrSt"), "AbCdEfGhIjKlMnOpQrSt");
  assert.equal(
    extractPlexToken("X-Plex-Token=AbCdEfGhIjKlMnOpQrSt"),
    "AbCdEfGhIjKlMnOpQrSt"
  );
});

test("extractPlexToken reads a Plex XML / library URL", () => {
  assert.equal(
    extractPlexToken("http://95.217.58.49:42400/library/metadata/1?X-Plex-Token=AbCdEfGhIjKlMnOpQrSt"),
    "AbCdEfGhIjKlMnOpQrSt"
  );
});

test("parsePlexHostPort splits a URL pasted into the host field", () => {
  assert.deepEqual(parsePlexHostPort("http://95.217.58.49:42400", "32400"), {
    protocol: "http",
    host: "95.217.58.49",
    port: "42400",
  });
  assert.deepEqual(parsePlexHostPort("95.217.58.49:42400", "32400"), {
    protocol: "http",
    host: "95.217.58.49",
    port: "42400",
  });
});

test("buildPlexBaseUrl uses https for plex.direct hosts", () => {
  assert.equal(
    buildPlexBaseUrl({
      host: "95-217-58-49.abc.plex.direct",
      port: "42400",
    }),
    "https://95-217-58-49.abc.plex.direct:42400"
  );
});

test("normalizePlexConfig cleans token and host", () => {
  const cfg = normalizePlexConfig({
    host: "http://95.217.58.49:42400",
    port: "32400",
    token: "?X-Plex-Token=AbCdEfGhIjKlMnOpQrSt",
  });
  assert.equal(cfg.host, "95.217.58.49");
  assert.equal(String(cfg.port), "42400");
  assert.equal(cfg.token, "AbCdEfGhIjKlMnOpQrSt");
  assert.equal(buildPlexBaseUrl(cfg), "http://95.217.58.49:42400");
});

test("plexImageRequestHeaders asks Plex for an image, not JSON", () => {
  const json = plexRequestHeaders("token", "id");
  const img = plexImageRequestHeaders("token", "id");
  assert.match(json.Accept, /json/i);
  assert.match(img.Accept, /image\//i);
  assert.doesNotMatch(img.Accept, /application\/json/i);
});
