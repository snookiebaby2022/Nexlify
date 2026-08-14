import assert from "node:assert/strict";
import test from "node:test";
import { safeJsonLd } from "./json-ld";

test("safeJsonLd escapes script breakout characters", () => {
  const html = safeJsonLd({ name: "</script><script>alert(1)</script>" });
  assert.equal(html.includes("</script>"), false);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /\\u003c/);
});
