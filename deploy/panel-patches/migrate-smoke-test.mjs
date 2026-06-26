/**
 * Smoke-test all panel migration parsers (no DB writes).
 * Run on VPS: cd /home/nexlify-panel && npx tsx /path/migrate-smoke-test.mjs
 */
import { bundleFromSql, bundleFromJson } from "./src/lib/panel-migration/map-rows";
import { previewMigrationBundle } from "./src/lib/panel-migration/index";

const results = [];

function check(name, fn) {
  try {
    const out = fn();
    const ok =
      out.pass === true ||
      out.streams > 0 ||
      out.lines > 0 ||
      out.bouquets > 0 ||
      name === "nexlify_json_empty";
    results.push({ name, ok, ...out, error: null });
  } catch (e) {
    results.push({ name, ok: false, error: String(e) });
  }
}

const xuiSql = [
  "INSERT INTO `streams` (`id`, `stream_display_name`, `stream_source`, `type`) VALUES",
  "(1, 'BBC One', '[\"http://example.com/bbc.m3u8\"]', 1);",
  "INSERT INTO `bouquets` (`id`, `bouquet_name`, `bouquet_channels`) VALUES",
  "(10, 'UK Pack', '[1]');",
  "INSERT INTO `lines` (`id`, `username`, `password`, `exp_date`, `bouquet`) VALUES",
  "(100, 'xui_user', 'xui_pass', 1893456000, '[10]');",
  "INSERT INTO `mag_devices` (`mac`, `user_id`) VALUES",
  "('00:1A:79:00:00:01', 100);",
].join("\n");

check("xui", () => {
  const b = bundleFromSql(xuiSql, "xui");
  const p = previewMigrationBundle(b);
  return {
    ...p.counts,
    magOk: b.magDevices?.length === 1,
    streamUrl: b.streams[0]?.streamUrl?.includes("bbc"),
    lineUser: b.lines[0]?.username,
  };
});

const onestreamSql = [
  "INSERT INTO subscriptions (id, username, password, expires_at, package_id) VALUES",
  "(1, 'os_user', 'os_pass', '2028-06-01', 5);",
  "INSERT INTO packages (id, name, streams) VALUES",
  "(5, 'Basic', '[101,102]');",
  "INSERT INTO streams (id, name, url, stream_type) VALUES",
  "(101, 'CNN', 'http://example.com/cnn.m3u8', 'live'),",
  "(102, 'HBO', 'http://example.com/hbo.m3u8', 'live');",
].join("\n");

check("onestream_sql", () => {
  const b = bundleFromSql(onestreamSql, "onestream");
  const p = previewMigrationBundle(b);
  return { ...p.counts, lineUser: b.lines[0]?.username };
});

const xtreamSql = [
  "INSERT INTO `users` (`id`, `username`, `password`, `exp_date`, `bouquet`) VALUES",
  "(1, 'xt_user', 'xt_pass', 1893456000, '[1]');",
  "INSERT INTO `streams` (`id`, `stream_display_name`, `stream_source`, `type`) VALUES",
  "(1, 'Sky News', '[\"http://example.com/sky.m3u8\"]', 1);",
  "INSERT INTO `bouquets` (`id`, `bouquet_name`, `bouquet_channels`) VALUES",
  "(1, 'News', '[1]');",
].join("\n");

check("xtream_ui", () => {
  const b = bundleFromSql(xtreamSql, "xtream_ui");
  const p = previewMigrationBundle(b);
  return { ...p.counts, lineUser: b.lines[0]?.username };
});

const midnightSql = [
  "INSERT INTO channels (id, name, source) VALUES",
  "(1, 'Ch1', 'http://example.com/ch1.m3u8');",
  "INSERT INTO packages (id, name, channels) VALUES",
  "(2, 'Pack A', '[1]');",
  "INSERT INTO subscribers (id, username, password, expires_at) VALUES",
  "(3, 'mid_user', 'mid_pass', '2028-12-31');",
].join("\n");

check("midnight_sql", () => {
  const b = bundleFromSql(midnightSql, "midnight");
  const p = previewMigrationBundle(b);
  return { ...p.counts, lineUser: b.lines[0]?.username };
});

const nexlifyJson = {
  source: "nexlify_json",
  streams: [{ legacyId: "1", name: "Test Ch", streamUrl: "http://example.com/t.m3u8", type: "LIVE" }],
  bouquets: [{ legacyId: "b1", name: "Pack", streamLegacyIds: ["1"] }],
  lines: [{ username: "json_user", password: "json_pass", expiresAt: "2028-01-01T00:00:00Z" }],
};

check("nexlify_json", () => {
  const b = bundleFromJson(nexlifyJson, "nexlify_json");
  const p = previewMigrationBundle(b);
  return { ...p.counts, lineUser: b.lines[0]?.username };
});

check("nexlify_json_empty", () => {
  const b = bundleFromJson({ streams: [], lines: [], bouquets: [] }, "nexlify_json");
  const p = previewMigrationBundle(b);
  return { ...p.counts };
});

// Edge cases
check("xui_no_streams_table", () => {
  const b = bundleFromSql("INSERT INTO lines (username, password, exp_date) VALUES ('a','b',1893456000);", "xui");
  const p = previewMigrationBundle(b);
  return { ...p.counts, linesOnly: p.counts.lines === 1 };
});

check("onestream_lines_alias", () => {
  const sql =
    "INSERT INTO lines (username, password, exp_date) VALUES ('alias_user', 'alias_pass', 1893456000);";
  const b = bundleFromSql(sql, "onestream");
  const p = previewMigrationBundle(b);
  return { ...p.counts };
});

// Xtream UI: users table is used for lines AND may appear in reseller scan
check("xtream_ui_users_only", () => {
  const sql =
    "INSERT INTO users (id, username, password, exp_date, member_group_id, is_admin) VALUES (1, 'cust1', 'pw1', 1893456000, 1, 0);";
  const b = bundleFromSql(sql, "xtream_ui");
  const p = previewMigrationBundle(b);
  const resellerCount = b.resellers?.length ?? 0;
  return {
    ...p.counts,
    lineOk: b.lines.length === 1,
    resellerDupRisk: resellerCount > 0,
    pass: b.lines.length === 1 && resellerCount === 0,
  };
});

// Midnight JSON path
check("midnight_json", () => {
  const raw = {
    streams: [{ legacyId: "1", name: "Ch", streamUrl: "http://x.m3u8" }],
    lines: [{ username: "mj", password: "pw", expiresAt: "2028-01-01" }],
    bouquets: [],
  };
  const b = bundleFromJson(raw, "midnight");
  const p = previewMigrationBundle(b);
  return { ...p.counts };
});

// XUI reseller filter (is_admin=1 should skip)
check("xui_reseller_filter", () => {
  const sql = [
    "INSERT INTO users (id, username, password, is_reseller, is_admin, member_group_id) VALUES",
    "(1, 'res1', 'rpw', 1, 0, 2);",
    "INSERT INTO users (id, username, password, is_reseller, is_admin, member_group_id) VALUES",
    "(2, 'admin1', 'apw', 0, 1, 1);",
  ].join("\n");
  const b = bundleFromSql(sql, "xui");
  const count = b.resellers?.length ?? 0;
  return {
    resellers: count,
    adminSkipped: count === 1 && b.resellers?.[0]?.username === "res1",
    pass: count === 1 && b.resellers?.[0]?.username === "res1",
  };
});

console.log("=== PANEL MIGRATION SMOKE TESTS ===\n");
let passed = 0;
let failed = 0;
for (const r of results) {
  const status = r.ok ? "PASS" : "FAIL";
  if (r.ok) passed++;
  else failed++;
  console.log(`${status}  ${r.name}`);
  if (r.error) console.log(`       error: ${r.error}`);
  else console.log(`       ${JSON.stringify(r)}`);
}
console.log(`\n${passed} passed, ${failed} failed, ${results.length} total`);
process.exit(failed > 0 ? 1 : 0);
