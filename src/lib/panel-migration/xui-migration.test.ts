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
  assert.ok(bundle.streams.length >= 3, `streams=${bundle.streams.length}`);
  assert.ok(bundle.lines.some((l) => l.username === "line1" && l.password === "pass1"));
  const news = bundle.streams.find((s) => s.name === "News HD");
  assert.ok(news, "News HD stream");
  assert.match(news!.streamUrl, /user:secret@cdn\.example\.com/);
  assert.match(String(news!.backupUrl), /user:secret@cdn2\.example\.com/);
  assert.equal(news!.extraSourceUrls?.length, 1);
  assert.match(String(news!.extraSourceUrls?.[0]), /user:secret@cdn3\.example\.com/);
  const fixed = bundle.streams.find((s) => s.name === "Empty Source Live");
  assert.ok(fixed, "empty source live kept");
  assert.match(fixed!.streamUrl, /edge\.example\.com\/live\/empty-source-fixed/);
  assert.equal(fixed!.sortOrder, 0, "order=0 preserved");
  assert.ok(
    (bundle.phase3?.onDemandStreamLegacyIds ?? []).includes("3"),
    "on_demand from streams_servers"
  );
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

test("empty stream_source becomes pending placeholder when no sys URL", async () => {
  const { pendingStreamUrl, isPendingStreamUrl } = await import("./stream-source-urls");
  const u = pendingStreamUrl("42", "xui");
  assert.equal(u, "pending://xui/42");
  assert.equal(isPendingStreamUrl(u), true);
  const sql = `
CREATE TABLE \`streams\` (\`id\` int, \`type\` int, \`stream_display_name\` varchar(255), \`stream_source\` mediumtext);
INSERT INTO \`streams\` (\`id\`,\`type\`,\`stream_display_name\`,\`stream_source\`) VALUES (99,1,'Orphan','[]');
`;
  const bundle = parseMigrationInput(sql, "xui", "sql");
  const orphan = bundle.streams.find((s) => s.legacyId === "99");
  assert.ok(orphan);
  assert.equal(orphan!.streamUrl, "pending://xui/99");
});

test("normalizeMigrationStreamUrl and identity keys match dump reimports", async () => {
  const {
    normalizeMigrationStreamUrl,
    migrationStreamIdentityKeys,
    fillMissingStreamFields,
    pendingStreamUrl,
  } = await import("./stream-source-urls");
  assert.equal(
    normalizeMigrationStreamUrl(" https://CDN.Example.com/live/1/ "),
    "https://cdn.example.com/live/1"
  );
  const keys = migrationStreamIdentityKeys({
    streamUrl: "http://cdn.example.com/live/1",
    legacyId: "42",
    source: "xui",
  });
  assert.ok(keys.includes("http://cdn.example.com/live/1"));
  assert.ok(keys.includes(pendingStreamUrl("42", "xui")));
  assert.ok(!keys.includes("ch:42"));

  const fill = fillMissingStreamFields(
    {
      streamUrl: pendingStreamUrl("42", "xui"),
      categoryId: null,
      serverId: null,
      backupUrl: null,
      streamIcon: null,
      containerExtension: null,
      epgChannelId: null,
      channelId: null,
    },
    {
      streamUrl: "http://cdn.example.com/live/1",
      categoryId: "cat-1",
      serverId: null,
      backupUrl: "http://b/1",
      streamIcon: "http://icon/1.png",
      containerExtension: "ts",
      epgChannelId: "bbc1",
      channelId: "42",
    }
  );
  assert.equal(fill.streamUrl, "http://cdn.example.com/live/1");
  assert.equal(fill.categoryId, "cat-1");
  assert.equal(fill.backupUrl, "http://b/1");
  assert.equal(fill.channelId, "42");

  const noOverwrite = fillMissingStreamFields(
    {
      streamUrl: "http://already.example.com/live/1",
      categoryId: "existing-cat",
      serverId: "srv-1",
      backupUrl: "http://b-old",
      streamIcon: "http://icon-old",
      containerExtension: "m3u8",
      epgChannelId: "old",
      channelId: "keep",
    },
    {
      streamUrl: "http://cdn.example.com/live/1",
      categoryId: "cat-1",
      serverId: "srv-2",
      backupUrl: "http://b/1",
      streamIcon: "http://icon/1.png",
      containerExtension: "ts",
      epgChannelId: "bbc1",
      channelId: "42",
    }
  );
  assert.deepEqual(noOverwrite, {});
});

test("SQL dump coverage warns when stream rows cannot be mapped", () => {
  const sql = `
CREATE TABLE \`streams\` (\`id\` int, \`type\` int, \`stream_display_name\` varchar(255), \`stream_source\` mediumtext);
INSERT INTO \`streams\` (\`id\`,\`type\`,\`stream_display_name\`,\`stream_source\`) VALUES
(1,1,'Mapped','["http://a/1"]'),
(NULL,1,'Missing id','["http://a/2"]');
`;
  const bundle = parseMigrationInput(sql, "xui", "sql");
  assert.equal(bundle.streams.length, 1);
  assert.ok(
    (bundle.warnings ?? []).some((w) => /SQL streams: mapped 1 of 2 dump rows/i.test(w)),
    (bundle.warnings ?? []).join("\n")
  );
});
