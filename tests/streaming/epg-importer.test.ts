import assert from "node:assert/strict";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import {
  iterateXmltvPrograms,
  parseXmltvDate,
  parseXmltvPrograms,
} from "../../src/lib/epg";
import { formatXmltvDateInTimezone, formatXmltvDateUtc } from "../../src/lib/epg-time";

function sampleGuide(extraProgrammes = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="bbc1.uk"><display-name>BBC One</display-name></channel>
  <channel id="bbc1.uk"><display-name>BBC One Dup</display-name></channel>
  <channel id="itv1.uk"><display-name>ITV</display-name></channel>
  <programme start="20250819220000 +0100" stop="20250819230000 +0100" channel="bbc1.uk">
    <title>News</title>
    <desc>Evening news</desc>
  </programme>
  <programme start="20250819230000 +0100" stop="20250820000000 +0100" channel="bbc1.uk">
    <title>Drama</title>
  </programme>
  <programme start="20250819220000 +0000" stop="20250819230000 +0000" channel="itv1.uk">
    <title>ITV Show</title>
  </programme>
  ${extraProgrammes}
</tv>`;
}

describe("EPG importer — valid XMLTV", () => {
  it("parses programmes with titles, channels, and timezone offsets", () => {
    const rows = parseXmltvPrograms(sampleGuide(), "src1");
    assert.equal(rows.length, 3);
    assert.equal(rows[0]!.channelId, "bbc1.uk");
    assert.equal(rows[0]!.title, "News");
    assert.equal(rows[0]!.description, "Evening news");
    assert.equal(rows[0]!.start.toISOString(), "2025-08-19T21:00:00.000Z");
    assert.equal(rows[0]!.stop.toISOString(), "2025-08-19T22:00:00.000Z");
    assert.equal(rows[2]!.start.toISOString(), "2025-08-19T22:00:00.000Z");
  });
});

describe("EPG importer — malformed XML", () => {
  it("skips programmes with bad timestamps or missing attrs", () => {
    const xml = `<?xml version="1.0"?>
<tv>
  <programme start="not-a-date" stop="20250819230000 +0000" channel="x">
    <title>Bad</title>
  </programme>
  <programme start="20250819220000 +0000" stop="20250819230000 +0000">
    <title>No channel</title>
  </programme>
  <programme start="20250819220000 +0000" stop="20250819230000 +0000" channel="ok">
    <title>Good</title>
  </programme>
</tv>`;
    const rows = parseXmltvPrograms(xml, "src1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.title, "Good");
  });

  it("rejects malformed XMLTV datetime at the date parser boundary", () => {
    assert.throws(() => parseXmltvDate("bogus"), /malformed|invalid/i);
    assert.throws(() => parseXmltvDate("20251301220000 +0000"), /out-of-range/i);
    assert.throws(() => parseXmltvDate("20250819220000 +9900"), /timezone/i);
  });
});

describe("EPG importer — wrong timezone", () => {
  it("shifts wall times by the declared offset (not panel TZ digits alone)", () => {
    const bst = parseXmltvDate("20250819223000 +0100");
    const utc = parseXmltvDate("20250819223000 +0000");
    assert.equal(bst.toISOString(), "2025-08-19T21:30:00.000Z");
    assert.equal(utc.toISOString(), "2025-08-19T22:30:00.000Z");
    assert.notEqual(bst.toISOString(), utc.toISOString());
  });

  it("round-trips UTC formatting without inventing a local offset", () => {
    const d = new Date("2025-08-19T21:30:00.000Z");
    assert.equal(formatXmltvDateUtc(d), "20250819213000 +0000");
    // Europe/London in August is BST (+0100) — digits are panel-local with real offset.
    const london = formatXmltvDateInTimezone(d, "Europe/London");
    assert.match(london, /^\d{14} [+-]\d{4}$/);
    assert.equal(parseXmltvDate(london).toISOString(), d.toISOString());
  });
});

describe("EPG importer — duplicate channel IDs", () => {
  it("keeps all programmes for a duplicated channel id (no silent drop)", () => {
    const rows = parseXmltvPrograms(sampleGuide(), "src1");
    const bbc = rows.filter((r) => r.channelId === "bbc1.uk");
    assert.equal(bbc.length, 2);
    assert.deepEqual(
      bbc.map((r) => r.title).sort(),
      ["Drama", "News"]
    );
  });
});

describe("EPG importer — gzip bodies", () => {
  it("decodes gzip XMLTV the same way the fetch path does before parse", () => {
    const xml = sampleGuide();
    const gz = gzipSync(Buffer.from(xml, "utf8"));
    assert.equal(gz[0], 0x1f);
    assert.equal(gz[1], 0x8b);
    const decoded = gunzipSync(gz).toString("utf8");
    const rows = [...iterateXmltvPrograms(decoded, "gz-src")];
    assert.equal(rows.length, 3);
    assert.ok(/<programme[\s>]/i.test(decoded));
  });
});

describe("EPG importer — huge file", () => {
  it("parses a large in-memory guide without throwing (streaming-friendly API)", () => {
    const chunks: string[] = [];
    for (let i = 0; i < 5_000; i++) {
      const startH = String(i % 24).padStart(2, "0");
      const stopH = String((i + 1) % 24).padStart(2, "0");
      const ch = `ch${i % 50}.uk`;
      chunks.push(
        `<programme start="20250819${startH}0000 +0000" stop="20250819${stopH}0000 +0000" channel="${ch}"><title>P${i}</title></programme>`
      );
    }
    const xml = `<?xml version="1.0"?><tv>${chunks.join("")}</tv>`;
    assert.ok(xml.length > 500_000);
    let n = 0;
    for (const row of iterateXmltvPrograms(xml, "huge")) {
      n += 1;
      if (n === 1) assert.equal(row.title, "P0");
    }
    assert.equal(n, 5_000);
  });
});
