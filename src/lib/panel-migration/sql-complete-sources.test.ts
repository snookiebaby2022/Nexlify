import assert from "node:assert/strict";
import test from "node:test";
import { parseMigrationInput } from "./index";
import { parseAllMysqlInserts, mergeSqlTables } from "./sql-parse";
import type { MigrationSource } from "./types";

const LINEAGE_SOURCES: MigrationSource[] = [
  "xui",
  "onestream",
  "xtream_ui",
  "streamcreed",
  "nxt",
  "midnight",
];

/** Multi-row INSERT with ';' inside a quoted plot — previously truncated after row 1. */
function dumpWithSemicolonInPlot(table = "streams"): string {
  return `
CREATE TABLE \`${table}\` (
  \`id\` int, \`type\` int, \`stream_display_name\` varchar(255),
  \`stream_source\` mediumtext, \`notes\` mediumtext
);
INSERT INTO \`${table}\` VALUES
(1,1,'Live One','["http://a/1"]','clean'),
(2,2,'Movie Semi','["http://a/2"]','Plot with semicolon; must keep row'),
(3,2,'Movie Two','["http://a/3"]','another; plot; here'),
(4,5,'Series Ep','["http://a/4"]','ok'),
(5,1,'Live Two','["http://a/5"]','end');
`;
}

test("sql parser keeps all rows when quoted values contain semicolons", () => {
  const sql = dumpWithSemicolonInPlot();
  const all = parseAllMysqlInserts(sql);
  const merged = mergeSqlTables(all.get("streams") ?? []);
  assert.ok(merged);
  assert.equal(merged!.rows.length, 5, `got ${merged!.rows.length} rows`);
  assert.equal(merged!.rows[1][2], "Movie Semi");
  assert.match(String(merged!.rows[1][4]), /semicolon/);
  assert.equal(merged!.rows[4][2], "Live Two");
});

for (const source of LINEAGE_SOURCES) {
  test(`${source}: maps full stream catalog despite semicolons in notes`, () => {
    const sql = dumpWithSemicolonInPlot();
    const bundle = parseMigrationInput(sql, source, "sql");
    assert.equal(bundle.streams.length, 5, `${source} streams=${bundle.streams.length}`);
    const live = bundle.streams.filter((s) => s.type === "LIVE").length;
    const movies = bundle.streams.filter((s) => s.type === "MOVIE").length;
    const series = bundle.streams.filter((s) => s.type === "SERIES").length;
    assert.equal(live, 2, `${source} live`);
    assert.equal(movies, 2, `${source} movies`);
    assert.equal(series, 1, `${source} series`);
    assert.ok(bundle.streams.some((s) => s.name === "Movie Semi"));
    assert.ok(bundle.streams.some((s) => s.name === "Live Two"));
  });
}

test("xtream_ui / streamcreed / nxt / midnight share XUI-style numeric types", () => {
  const sql = `
CREATE TABLE \`streams\` (\`id\` int, \`type\` int, \`stream_display_name\` varchar(255), \`stream_source\` mediumtext);
INSERT INTO \`streams\` VALUES
(1,1,'L','["http://x/1"]'),
(2,2,'M','["http://x/2"]'),
(3,3,'Created','["http://x/3"]'),
(4,4,'Radio','["http://x/4"]'),
(5,5,'S','["http://x/5"]');
`;
  for (const source of ["xtream_ui", "streamcreed", "nxt", "midnight"] as MigrationSource[]) {
    const bundle = parseMigrationInput(sql, source, "sql");
    assert.equal(bundle.streams.find((s) => s.legacyId === "1")?.type, "LIVE");
    assert.equal(bundle.streams.find((s) => s.legacyId === "2")?.type, "MOVIE");
    assert.equal(bundle.streams.find((s) => s.legacyId === "3")?.type, "LIVE");
    assert.equal(bundle.streams.find((s) => s.legacyId === "4")?.type, "LIVE");
    assert.equal(bundle.streams.find((s) => s.legacyId === "4")?.isRadio, true);
    assert.equal(bundle.streams.find((s) => s.legacyId === "5")?.type, "SERIES");
  }
});
