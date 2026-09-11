/**
 * Harness smoke test — proves mocks + factories work without touching prod.
 * DB persistence is optional (skipped when TEST_DATABASE_URL is unset).
 */
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { spawn } from "node:child_process";
import {
  buildAdmin,
  buildReseller,
  buildSubReseller,
  buildEndUserLine,
  buildBouquet,
  buildLiveStream,
  buildSeriesEpisode,
  buildEpgSource,
  buildMagDevice,
  hasTestDatabase,
  createAdmin,
  createReseller,
  createSubReseller,
  createBouquet,
  createLiveStream,
  createSeriesEpisode,
  createEndUserLine,
  createEpgSource,
  createMagDevice,
  seedMinimalPanelGraph,
} from "../factories/index.ts";
import { disconnectTestPrisma, hasTestDatabase, isSafeTestDatabaseUrl } from "../helpers/prisma.ts";
import { mockCreatePaymentIntent, mockListPayments, mockResetPayments } from "../mocks/payments.ts";

describe("test harness smoke", () => {
  after(async () => {
    await disconnectTestPrisma().catch(() => undefined);
  });

  it("refuses production-looking database URLs", () => {
    assert.equal(isSafeTestDatabaseUrl(undefined), false);
    assert.equal(isSafeTestDatabaseUrl("postgresql://u:p@85.17.162.54:5432/nexlify"), false);
    assert.equal(isSafeTestDatabaseUrl("postgresql://u:p@127.0.0.1:5432/nexlify_test"), true);
    assert.equal(hasTestDatabase(), isSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL));
  });

  it("mocks FFmpeg spawn by default", async () => {
    const before = globalThis.__nexlifyTestMocks?.ffmpegSpawns ?? 0;
    await new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-version"]);
      child.on("close", () => resolve(undefined));
      child.on("error", reject);
    });
    const afterCount = globalThis.__nexlifyTestMocks?.ffmpegSpawns ?? 0;
    assert.ok(afterCount > before, "expected ffmpeg spawn to be intercepted");
  });

  it("mocks outbound fetch (non-localhost)", async () => {
    const before = globalThis.__nexlifyTestMocks?.fetchCalls ?? 0;
    const res = await fetch("https://example.com/payment/charge", {
      method: "POST",
      body: "{}",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mocked, true);
    assert.ok((globalThis.__nexlifyTestMocks?.fetchCalls ?? 0) > before);
  });

  it("payment gateway double records intents without network", () => {
    mockResetPayments();
    const pi = mockCreatePaymentIntent({ amountCents: 999, currency: "gbp" });
    assert.equal(pi.status, "succeeded");
    assert.equal(mockListPayments().length, 1);
  });

  it("factories build admin, reseller, sub-reseller, line, bouquet, streams, epg, mag", async () => {
    const admin = await buildAdmin();
    const reseller = await buildReseller();
    const sub = await buildSubReseller("parent_id_placeholder");
    const line = buildEndUserLine();
    const bouquet = buildBouquet();
    const live = buildLiveStream();
    const series = buildSeriesEpisode({ seriesName: "Smoke Series" });
    const epg = buildEpgSource();
    const mag = buildMagDevice("line_id_placeholder", { mac: "00:1A:79:AA:BB:CC" });

    assert.equal(admin.role, "ADMIN");
    assert.equal(reseller.role, "RESELLER");
    assert.equal(sub.role, "SUB_RESELLER");
    assert.ok(admin.passwordHash.startsWith("$2"));
    assert.ok(line.username.length > 0);
    assert.ok(bouquet.name);
    assert.equal(live.type, "LIVE");
    assert.equal(series.type, "SERIES");
    assert.equal(series.seriesName, "Smoke Series");
    assert.ok(epg.url.includes("http"));
    assert.equal(mag.mac, "00:1A:79:AA:BB:CC");
  });

  it(
    "persists a minimal graph when TEST_DATABASE_URL is configured",
    { skip: !hasTestDatabase() },
    async () => {
      const graph = await seedMinimalPanelGraph();
      assert.ok(graph.admin.id);
      assert.ok(graph.reseller.id);
      assert.ok(graph.sub.parentId === graph.reseller.id);
      assert.ok(graph.line.username);
      assert.ok(graph.live.id);
      assert.ok(graph.episode.seriesName);
      assert.ok(graph.mag.lineId === graph.line.id);
      assert.ok(graph.epg.id);
      assert.ok(graph.bouquet.id);

      // Also exercise individual create* helpers once
      const extraBq = await createBouquet();
      const extraLive = await createLiveStream({ bouquetId: extraBq.id });
      const extraLine = await createEndUserLine({ bouquetIds: [extraBq.id] });
      await createMagDevice(extraLine.id);
      await createEpgSource();
      await createSeriesEpisode({ bouquetId: extraBq.id });
      assert.ok(extraLive.id);
      assert.ok(extraLine.id);

      // Ensure role factories persist
      const a2 = await createAdmin();
      const r2 = await createReseller({ credits: 10 });
      const s2 = await createSubReseller(r2.id);
      assert.equal(a2.role, "ADMIN");
      assert.equal(r2.role, "RESELLER");
      assert.equal(s2.role, "SUB_RESELLER");
    }
  );
});
