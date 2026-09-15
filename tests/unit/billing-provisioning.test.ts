import assert from "node:assert/strict";
import test from "node:test";

test("runProvisioningRequest rejects missing secret", async () => {
  const prev = process.env.BILLING_WEBHOOK_SECRET;
  process.env.BILLING_WEBHOOK_SECRET = "test-secret-123";
  try {
    const { runProvisioningRequest } = await import("@/lib/billing-provisioning");
    const bad = await runProvisioningRequest({ operation: "listPackages" }, "wrong");
    assert.equal(bad.ok, false);
    assert.match(String(bad.error), /secret/i);
  } finally {
    if (prev === undefined) delete process.env.BILLING_WEBHOOK_SECRET;
    else process.env.BILLING_WEBHOOK_SECRET = prev;
  }
});
