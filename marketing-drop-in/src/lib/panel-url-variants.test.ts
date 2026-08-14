import assert from "node:assert/strict";
import test from "node:test";
import { panelUrlCandidates } from "./panel-url-variants";

test("panelUrlCandidates includes http/https and strips trailing slash", () => {
  const urls = panelUrlCandidates("https://45.88.138.18/");
  assert.ok(urls.includes("https://45.88.138.18"));
  assert.ok(urls.includes("http://45.88.138.18"));
});

test("panelUrlCandidates accepts a bare IP", () => {
  const urls = panelUrlCandidates("45.88.138.18");
  assert.ok(urls.includes("http://45.88.138.18"));
  assert.ok(urls.includes("https://45.88.138.18"));
});
