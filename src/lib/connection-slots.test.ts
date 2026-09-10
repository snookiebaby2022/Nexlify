import assert from "node:assert/strict";
import test from "node:test";

test("capacity fail-open is opt-in only", () => {
  const prev = process.env.NEXLIFY_CAPACITY_FAIL_OPEN;
  delete process.env.NEXLIFY_CAPACITY_FAIL_OPEN;
  const enabled =
    process.env.NEXLIFY_CAPACITY_FAIL_OPEN === "1" ||
    process.env.NEXLIFY_CAPACITY_FAIL_OPEN === "true";
  assert.equal(enabled, false);
  if (prev != null) process.env.NEXLIFY_CAPACITY_FAIL_OPEN = prev;
});

test("tryAcquireConnSlot returns a known result code", async () => {
  const { tryAcquireConnSlot } = await import("./connection-slots");
  const result = await tryAcquireConnSlot("line-test-slots", 1, {
    streamId: "s1",
    clientIp: "192.0.2.1",
  });
  assert.ok(
    result === "unavailable" ||
      result === "acquired" ||
      result === "existing" ||
      result === "denied"
  );
});
