import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeStreamPath,
  normalizeStreamMatchKey,
  streamUrlHosts,
} from "./stream-url-match";

test("normalizeStreamMatchKey strips default :443 and :80", () => {
  assert.equal(
    normalizeStreamMatchKey("https://junki3monk3y.com:443/Blade2nd/pass/1"),
    normalizeStreamMatchKey("https://junki3monk3y.com/Blade2nd/pass/1")
  );
  assert.equal(
    normalizeStreamMatchKey("http://example.com:80/a/b/3"),
    normalizeStreamMatchKey("http://example.com/a/b/3")
  );
});

test("normalizeStreamMatchKey equates /live/user/pass/id and short form", () => {
  const short = "https://junki3monk3y.com:443/Blade2nd/PaaJhvNbqX/46665";
  const live = "https://junki3monk3y.com/live/Blade2nd/PaaJhvNbqX/46665";
  assert.equal(normalizeStreamMatchKey(short), normalizeStreamMatchKey(live));
});

test("canonicalizeStreamPath keeps movie/series prefixes", () => {
  assert.equal(
    canonicalizeStreamPath("/movie/u/p/123.mp4"),
    "/movie/u/p/123.mp4"
  );
  assert.equal(
    canonicalizeStreamPath("/series/u/p/1.mkv"),
    "/series/u/p/1.mkv"
  );
});

test("normalizeStreamMatchKey equates movie URLs with default HTTPS port", () => {
  assert.equal(
    normalizeStreamMatchKey("https://cdn.example:443/movie/u/p/9.mp4"),
    normalizeStreamMatchKey("https://cdn.example/movie/u/p/9.mp4")
  );
});

test("streamUrlHosts extracts unique hosts", () => {
  const hosts = streamUrlHosts([
    "https://a.example:443/x",
    "http://A.Example/y",
    "not-a-url",
  ]);
  assert.deepEqual(hosts, ["a.example"]);
});
