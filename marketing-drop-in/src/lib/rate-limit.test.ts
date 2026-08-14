import assert from "node:assert/strict";
import test from "node:test";
import { rateLimit } from "./rate-limit";

test("rateLimit allows up to the limit then blocks", () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  const blocked = rateLimit(key, 2, 60_000);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
});
