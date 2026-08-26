import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateFlag, normalizeMigrateApplyOptions } from "./migrate-flags";
import { pickMigrateStreamServerId } from "./migrate-stream-server";

test("pickMigrateStreamServerId refuses offline dump servers", () => {
  const usable = new Set(["main"]);
  assert.equal(pickMigrateStreamServerId("dead-lb", usable, "main"), "main");
  assert.equal(pickMigrateStreamServerId("main", usable, "main"), "main");
  assert.equal(pickMigrateStreamServerId("dead-lb", usable, undefined), undefined);
});

test("migrateFlag treats string false as off", () => {
  assert.equal(migrateFlag(false, true), false);
  assert.equal(migrateFlag("false", true), false);
  assert.equal(migrateFlag("0", true), false);
  assert.equal(migrateFlag("off", true), false);
  assert.equal(migrateFlag(true, false), true);
  assert.equal(migrateFlag(undefined, true), true);
  assert.equal(migrateFlag(undefined, false), false);
});

test("normalizeMigrateApplyOptions honours unticked skip-existing", () => {
  const opts = normalizeMigrateApplyOptions({
    skipExistingLines: false,
    skipExistingStreams: "false",
    importResellers: true,
  });
  assert.equal(opts.skipExistingLines, false);
  assert.equal(opts.skipExistingStreams, false);
  assert.equal(opts.importResellers, true);
  assert.equal(opts.importEpgGuide, true);
});
