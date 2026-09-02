import assert from "node:assert/strict";
import { test } from "node:test";
import { pickCanonicalLiveConnectionRows } from "./connections";

const base = {
  lineId: "line1",
  streamId: "stream9",
  lastSeenAt: new Date("2026-09-02T12:00:00Z"),
};

test("pickCanonicalLiveConnectionRows keeps newest heartbeat for duplicate viewer keys", () => {
  const rows = pickCanonicalLiveConnectionRows([
    {
      ...base,
      id: "new",
      ip: "198.51.100.2",
      lastSeenAt: new Date("2026-09-02T12:05:00Z"),
      startedAt: new Date("2026-09-02T12:05:00Z"),
    },
    {
      ...base,
      id: "old",
      ip: "198.51.100.2",
      lastSeenAt: new Date("2026-09-02T11:05:00Z"),
      startedAt: new Date("2026-09-02T11:00:00Z"),
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, "new");
});

test("pickCanonicalLiveConnectionRows drops anonymous edge row when real viewer IP exists", () => {
  const rows = pickCanonicalLiveConnectionRows([
    {
      ...base,
      id: "edge",
      ip: null,
      startedAt: new Date("2026-09-02T11:00:00Z"),
    },
    {
      ...base,
      id: "viewer",
      ip: "198.51.100.2",
      startedAt: new Date("2026-09-02T12:00:00Z"),
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.id, "viewer");
  assert.equal(rows[0]!.startedAt.toISOString(), "2026-09-02T11:00:00.000Z");
});

test("pickCanonicalLiveConnectionRows keeps two real viewers on the same stream", () => {
  const rows = pickCanonicalLiveConnectionRows([
    {
      ...base,
      id: "a",
      ip: "198.51.100.2",
      startedAt: new Date("2026-09-02T11:00:00Z"),
    },
    {
      ...base,
      id: "b",
      ip: "198.51.100.3",
      startedAt: new Date("2026-09-02T11:30:00Z"),
    },
  ]);
  assert.equal(rows.length, 2);
});
