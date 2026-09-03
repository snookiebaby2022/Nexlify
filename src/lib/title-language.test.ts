import assert from "node:assert/strict";
import { test } from "node:test";
import { detectTitleLanguage, isNonEnglishTitle } from "./title-language";

test("latin titles without meta are English", () => {
  const lang = detectTitleLanguage("Inception");
  assert.equal(lang.english, true);
  assert.equal(lang.code, "en");
});

test("TMDB original_language wins", () => {
  const lang = detectTitleLanguage("Dune", { meta: { original_language: "fr" } });
  assert.equal(lang.english, false);
  assert.equal(lang.label, "French");
});

test("Arabic / CJK / Cyrillic scripts are foreign", () => {
  assert.equal(isNonEnglishTitle("مسلسل"), true);
  assert.equal(isNonEnglishTitle("鬼灭之刃"), true);
  assert.equal(isNonEnglishTitle("Игра престолов"), true);
});

test("Bollywood / Turkish category names are foreign", () => {
  assert.equal(isNonEnglishTitle("Some Movie", { categoryName: "Bollywood" }), true);
  assert.equal(isNonEnglishTitle("Some Show", { categoryName: "Turkish" }), true);
});

test("English titles in a foreign folder are low-confidence", () => {
  const lang = detectTitleLanguage("BBC One HD", { categoryName: "Turkish" });
  assert.equal(lang.english, false);
  assert.equal(lang.reason, "category");
  assert.equal(lang.confidence, "low");
});
