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
  assert.ok(bundle.lines.some((l) => l.username === "line1" && l.password === "pass1"));
  const news = bundle.streams.find((s) => s.name === "News HD");
  assert.ok(news, "News HD stream");
  assert.match(news!.streamUrl, /user:secret@cdn\.example\.com/);
  assert.match(String(news!.backupUrl), /user:secret@cdn2\.example\.com/);
  assert.equal(news!.extraSourceUrls?.length, 1);
  assert.match(String(news!.extraSourceUrls?.[0]), /user:secret@cdn3\.example\.com/);
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
  const prov = phase3!.providers.find((p) => p.baseUrl.includes("provider.example.com"));
  assert.ok(prov, "provider baseUrl from ip/port/ssl");
  assert.equal(prov!.apiKey, "user:pass");
  const servers = bundle.phase2?.servers ?? [];
  const srv = servers.find((s) => s.legacyId === "9");
  assert.ok(srv, "server 9");
  assert.equal(srv!.domain, "x.example.com");
  assert.equal(srv!.port, 80);
  assert.equal(srv!.httpsPort, 443);
  assert.ok(!(bundle.warnings ?? []).some((w) => /0 rows mapped/i.test(w)), (bundle.warnings ?? []).join("\n"));
});

test("streamUrlsFromSource keeps every credentialed URL", async () => {
  const { streamUrlsFromSource } = await import("./stream-source-urls");
  const got = streamUrlsFromSource(
    '["http://a:b@one/x","http://a:b@two/x","http://a:b@three/x"]'
  );
  assert.equal(got.primary, "http://a:b@one/x");
  assert.equal(got.backup, "http://a:b@two/x");
  assert.deepEqual(got.extras, ["http://a:b@three/x"]);
});
