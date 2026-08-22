import assert from "node:assert/strict";
import test from "node:test";
import {
  formatXtreamTimeshiftStart,
  panelTimeshiftUrl,
  parseStalkerArchiveCmd,
  streamHasArchive,
} from "./catchup-playback-url";

test("streamHasArchive detects catchup modes", () => {
  assert.equal(streamHasArchive({ vodMode: "CATCHUP" }), true);
  assert.equal(streamHasArchive({ archiveDays: 3 }), true);
  assert.equal(streamHasArchive({ timeshiftSeconds: 3600 }), true);
  assert.equal(streamHasArchive({ isShifted: true }), true);
  assert.equal(streamHasArchive({}), false);
});

test("parseStalkerArchiveCmd parses Ministra file cmd", () => {
  const r = parseStalkerArchiveCmd("auto /media/file_abc123_1700000000_7200.mpg");
  assert.deepEqual(r, { streamId: "abc123", startUnix: 1700000000, durationSec: 7200 });
});

test("parseStalkerArchiveCmd parses ffmpeg offset cmd", () => {
  const r = parseStalkerArchiveCmd("ffmpeg ch1 offset 600 duration 1800");
  assert.equal(r?.streamId, "ch1");
  assert.equal(r?.durationSec, 1800);
  assert.ok(r && r.startUnix < Math.floor(Date.now() / 1000));
});

test("panelTimeshiftUrl builds xtream timeshift path", () => {
  const url = panelTimeshiftUrl("http://panel.test", "user", "pass", "stream1", 1704067200, 3600);
  assert.match(url, /\/timeshift\/user\/pass\/60\//);
  assert.match(url, /stream1\.ts$/);
  assert.match(formatXtreamTimeshiftStart(new Date(1704067200 * 1000)), /^\d{4}-\d{2}-\d{2}:\d{2}-\d{2}$/);
});
