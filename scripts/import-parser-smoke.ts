/**
 * Smoke tests for SQL/M3U import parsers (no DB).
 * Run: npx tsx scripts/import-parser-smoke.ts
 */
import {
  flattenIdList,
  looksLikePlayableUrl,
  phpSerializedIdValues,
  phpSerializedStringValues,
  urlsFromPhpSerialized,
} from "../src/lib/panel-migration/sql-junctions";
import { parseM3u } from "../src/lib/m3u-parser";
import { isMigrationParseNote } from "../src/lib/panel-migration/parse-notes";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    console.error(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
    failed++;
  } else {
    console.log(`ok   ${name}`);
  }
}

const url = "http://cdn.example.com:8080/live/1";
eq("php string length", phpSerializedStringValues(`a:1:{i:0;s:${url.length}:"${url}";}`), [url]);
eq("php urls", urlsFromPhpSerialized(`a:1:{i:0;s:${url.length}:"${url}";}`), [url]);
eq(
  "php bouquet ids skip indexes",
  phpSerializedIdValues('a:2:{s:4:"live";a:2:{i:0;i:12;i:1;i:34;}}'),
  ["12", "34"]
);
eq("flatten php bouquet", flattenIdList('a:2:{s:4:"live";a:2:{i:0;i:12;i:1;i:34;}}'), ["12", "34"]);
eq("flatten json obj", flattenIdList('{"live":[1,2],"vod":[3]}'), ["1", "2", "3"]);
eq("flatten csv", flattenIdList("10,20,30"), ["10", "20", "30"]);
eq("playable http", looksLikePlayableUrl("https://x/live/1.ts"), true);
eq("reject name", looksLikePlayableUrl("CNN HD"), false);
eq("reject php blob", looksLikePlayableUrl('a:1:{i:0;s:3:"abc";}'), false);

const m3u = parseM3u(`#EXTM3U
#EXTINF:-1 tvg-id="cnn" group-title="News",CNN
#EXTVLCOPT:http-user-agent=VLC
https://cdn.example.com/cnn.m3u8
#EXTINF:-1,UDP
udp://@239.1.1.1:1234
#EXTINF:-1,Bare host
host.example.com:8080/live/2
`);
eq("m3u count", m3u.length, 3);
eq("m3u https after vlcopt", m3u[0]?.url, "https://cdn.example.com/cnn.m3u8");
eq("m3u udp", m3u[1]?.url, "udp://@239.1.1.1:1234");
eq("m3u host:port", m3u[2]?.url, "host.example.com:8080/live/2");

eq("headerless create table is a note", isMigrationParseNote('Applied CREATE TABLE column names for headerless table "streams" (55 columns).'), true);
eq("content breakdown is a note", isMigrationParseNote("Content breakdown: 1548 live, 5811 movies, 2688 TV series, 11796 TV episodes."), true);
eq("60 skipped of 19215 is a note", isMigrationParseNote("Mapped 19155 of 19215 stream row(s); 60 skipped (empty or unusable stream_source)."), true);
eq("missing table stays a warning", isMigrationParseNote('Table "streams" matched but contained no rows'), false);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall import parser smokes passed");
