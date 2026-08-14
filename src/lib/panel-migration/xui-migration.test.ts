import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseMigrationInput } from "./index";
import { xuiDurationToDays } from "./map-rows";
import { flattenIdList } from "./sql-junctions";

test("xuiDurationToDays converts months/hours", () => {
  assert.equal(xuiDurationToDays(12, "months"), 360);
  assert.equal(xuiDurationToDays(24, "hours"), 1);
  assert.equal(xuiDurationToDays(7, "days"), 7);
});

test("flattenIdList accepts plain XUI bouquet arrays", () => {
  assert.deepEqual(flattenIdList("[1,2,3]"), ["1", "2", "3"]);
  assert.deepEqual(flattenIdList('{"live":[1],"movie":[2]}'), ["1", "2"]);
});

test("modern XUI fixture maps lines, bouquets, packages, providers, mag", () => {
  const sql = readFileSync(join(process.cwd(), "scripts/fixtures/xui-modern.sql"), "utf8");
  const bundle = parseMigrationInput(sql, "xui", "sql");
  assert.ok(bundle.streams.length >= 2, `streams=${bundle.streams.length}`);
  assert.ok(bundle.lines.some((l) => l.username === "line1"));
  const main = bundle.bouquets.find((b) => b.name === "Main");
  assert.ok(main, "Main bouquet");
  assert.ok(main!.streamLegacyIds.includes("1"), `channels ${main!.streamLegacyIds}`);
  assert.ok(main!.streamLegacyIds.includes("2"), "movies linked");
  const pkg = (bundle.packages ?? []).find((p) => p.name.includes("12 month"));
  assert.ok(pkg, "12 month package");
  assert.ok((pkg!.days ?? 0) >= 300, `days should be ~360 months, got ${pkg!.days}`);
  const mag = (bundle.magDevices ?? []).find((m) => m.mac.includes("00:1A:79"));
  assert.ok(mag, "MAG device");
  assert.equal(mag!.lineUsername, "line1");
  const phase3 = bundle.phase3;
  assert.ok(phase3?.providers?.length, "providers");
  assert.ok(
    phase3!.providers.some((p) => p.baseUrl.includes("provider.example.com")),
    "provider baseUrl from ip/port/ssl"
  );
  assert.ok(!(bundle.warnings ?? []).some((w) => /0 rows mapped/i.test(w)), (bundle.warnings ?? []).join("\n"));
});
