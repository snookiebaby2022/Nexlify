import assert from "node:assert/strict";
import test from "node:test";
import {
  forcedAiTake,
  redactAiRow,
  resolveAiPrismaModel,
  sanitizeAiSelect,
  sanitizeAiWhere,
} from "./ai-prisma-plan";

test("forcedAiTake always clamps to a positive max", () => {
  assert.equal(forcedAiTake(undefined), 50);
  assert.equal(forcedAiTake(0), 50);
  assert.equal(forcedAiTake(999), 50);
  assert.equal(forcedAiTake(10), 10);
});

test("sanitizeAiSelect strips secret fields", () => {
  const select = sanitizeAiSelect(
    { username: true, passwordHash: true, passwordPlain: true },
    "panelUser"
  );
  assert.deepEqual(select, { username: true });
});

test("sanitizeAiWhere drops secret keys and keeps equals/contains", () => {
  const where = sanitizeAiWhere({
    username: { contains: "admin" },
    passwordHash: { equals: "x" },
    AND: [{ isActive: { equals: true } }],
  });
  assert.equal("passwordHash" in where, false);
  assert.deepEqual((where.username as { contains: string }).contains, "admin");
});

test("redactAiRow removes nested secrets", () => {
  const out = redactAiRow({
    username: "admin",
    passwordPlain: "secret",
    nested: { totpSecret: "abc", id: "1" },
  }) as Record<string, unknown>;
  assert.equal(out.username, "admin");
  assert.equal("passwordPlain" in out, false);
  assert.deepEqual(out.nested, { id: "1" });
});

test("resolveAiPrismaModel maps PascalCase and rejects unknown", () => {
  assert.equal(resolveAiPrismaModel("PanelUser"), "panelUser");
  assert.equal(resolveAiPrismaModel("stream"), "stream");
  assert.equal(resolveAiPrismaModel("dropTable"), null);
});
