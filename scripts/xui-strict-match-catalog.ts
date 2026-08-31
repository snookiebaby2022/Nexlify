/**
 * Make the panel catalog match an XUI.one dump:
 * - skip streams already in the correct category
 * - move / create the rest
 * - overwrite bouquet membership
 * - delete extra streams, categories, and bouquets not in the dump
 *
 * Usage:
 *   npx tsx scripts/xui-strict-match-catalog.ts /tmp/xui-catalog-only.sql
 *   npx tsx scripts/xui-strict-match-catalog.ts /tmp/xui-catalog-only.sql --apply
 */
import { StreamType, VodMode } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { bundleFromSqlFile } from "../src/lib/panel-migration/map-rows";
import { applyMigrationPhase2 } from "../src/lib/panel-migration/phase2";
import { migrationStreamIdentityKeys } from "../src/lib/panel-migration/stream-source-urls";
import { urlsFromPhpSerialized, looksLikePlayableUrl } from "../src/lib/panel-migration/sql-junctions";
import { deleteCategoriesSafe } from "../src/lib/category-tree";
import {
  pickMigrateStreamServerId,
  usableMigrateStreamServerIds,
  streamServerUsableForPlayback,
} from "../src/lib/panel-migration/migrate-stream-server";

const DUMP = process.argv[2] || "/tmp/xui-catalog-only.sql";
const APPLY = process.argv.includes("--apply");
const BATCH = 800;

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

function dumpUrl(raw: string): string {
  let streamUrl = String(raw ?? "").trim();
  if (/^(a|O|C):\d+:\{/.test(streamUrl) || /^s:\d+:"/.test(streamUrl)) {
    streamUrl = urlsFromPhpSerialized(streamUrl)[0] ?? "";
  }
  if (!looksLikePlayableUrl(streamUrl) && !streamUrl.startsWith("pending://")) {
    streamUrl = urlsFromPhpSerialized(streamUrl)[0] ?? streamUrl;
  }
  return streamUrl;
}

async function loadPanelStreams() {
  const total = await prisma.stream.count();
  const rows: Array<{
    id: string;
    streamUrl: string;
    name: string;
    categoryId: string | null;
  }> = [];
  let cursor: string | undefined;
  while (rows.length < total) {
    const batch = await prisma.stream.findMany({
      take: 2000,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, streamUrl: true, name: true, categoryId: true },
    });
    if (!batch.length) break;
    rows.push(...batch);
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < 2000) break;
    if (rows.length % 100000 === 0) log(`preload streams ${rows.length}/${total}`);
  }
  return rows;
}

async function chunked<T>(ids: T[], fn: (slice: T[]) => Promise<void>) {
  for (let i = 0; i < ids.length; i += BATCH) {
    await fn(ids.slice(i, i + BATCH));
    if ((i + BATCH) % (BATCH * 20) === 0 || i + BATCH >= ids.length) {
      log(`  ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
    }
  }
}

async function main() {
  log(`parse ${DUMP} apply=${APPLY}`);
  const bundle = await bundleFromSqlFile(DUMP, "xui");
  log(
    `dump streams=${bundle.streams.length} cats=${bundle.phase2?.categories.length ?? 0} bouquets=${bundle.bouquets.length}`
  );

  const phase2 = await applyMigrationPhase2(bundle.phase2 ?? { categories: [], servers: [], epgSources: [] }, {
    importCategories: true,
    importServers: false,
    importEpg: false,
    skipExisting: true,
  });
  const categoryIdByLegacy = phase2.categoryIdByLegacy;
  log(`categories imported=${phase2.result.categories.imported} skipped=${phase2.result.categories.skipped}`);

  const keepCategoryIds = new Set<string>(categoryIdByLegacy.values());
  const dumpBouquetNames = new Set(
    bundle.bouquets.map((b) => String(b.name ?? "").trim()).filter(Boolean)
  );

  const panel = await loadPanelStreams();
  log(`panel streams=${panel.length}`);

  const byKey = new Map<string, (typeof panel)[0]>();
  for (const row of panel) {
    for (const k of migrationStreamIdentityKeys({ streamUrl: row.streamUrl, source: "xui" })) {
      if (!byKey.has(k)) byKey.set(k, row);
    }
  }

  const keepIds = new Set<string>();
  const streamIdByLegacy = new Map<string, string>();
  const toMove: Array<{ id: string; categoryId: string; name: string }> = [];
  const toCreate: typeof bundle.streams = [];
  let skippedCorrect = 0;
  let unmatchedDump = 0;

  for (const s of bundle.streams) {
    const streamUrl = dumpUrl(s.streamUrl);
    if (!s.legacyId || !streamUrl || streamUrl === "0" || /^-?\d+(\.\d+)?$/.test(streamUrl)) {
      unmatchedDump += 1;
      continue;
    }
    const wantCat = s.categoryLegacyId ? categoryIdByLegacy.get(s.categoryLegacyId) : undefined;
    let hit: (typeof panel)[0] | undefined;
    for (const k of migrationStreamIdentityKeys({
      streamUrl,
      legacyId: s.legacyId,
      source: "xui",
    })) {
      hit = byKey.get(k);
      if (hit) break;
    }
    if (!hit) {
      toCreate.push(s);
      continue;
    }
    keepIds.add(hit.id);
    streamIdByLegacy.set(s.legacyId, hit.id);
    if (wantCat && hit.categoryId === wantCat) {
      skippedCorrect += 1;
      continue;
    }
    if (!wantCat) {
      skippedCorrect += 1;
      continue;
    }
    toMove.push({ id: hit.id, categoryId: wantCat, name: String(s.name ?? hit.name).trim() || hit.name });
  }

  const extraStreamIds = panel.filter((r) => !keepIds.has(r.id)).map((r) => r.id);

  log(
    JSON.stringify({
      skippedAlreadyCorrect: skippedCorrect,
      moveWrongFolder: toMove.length,
      createMissing: toCreate.length,
      deleteExtraStreams: extraStreamIds.length,
      unmatchedDumpRows: unmatchedDump,
    })
  );

  if (keepIds.size < Math.floor(bundle.streams.length * 0.75) && toCreate.length > 50_000) {
    throw new Error(
      `Abort: too few matches (keep=${keepIds.size} create=${toCreate.length}). Refusing destructive apply.`
    );
  }

  const extraBouquets = await prisma.bouquet.findMany({
    where: { name: { notIn: [...dumpBouquetNames] } },
    select: { id: true, name: true, _count: { select: { streams: true, lines: true } } },
  });
  log(
    `extra bouquets to delete: ${extraBouquets.length} ${extraBouquets
      .map((b) => `${b.name}(${b._count.streams}s/${b._count.lines}l)`)
      .join("; ")}`
  );

  const extraCategories = await prisma.category.findMany({
    where: { id: { notIn: [...keepCategoryIds] } },
    select: { id: true, name: true },
  });
  log(`extra categories to delete: ${extraCategories.length}`);

  const LINE_REMAP: Record<string, string> = {
    "TV Series": "VOD",
    XXX: "ADULT",
  };

  if (!APPLY) {
    log("dry-run only. Re-run with --apply to write.");
    log(`line remap before bouquet delete: ${JSON.stringify(LINE_REMAP)}`);
    return;
  }

  const panelServers = await prisma.streamServer.findMany({
    where: { isActive: true },
    select: {
      id: true,
      host: true,
      isActive: true,
      healthStatus: true,
      agentToken: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  const usable = await usableMigrateStreamServerIds(panelServers.map((s) => s.id));
  const fallback = panelServers.find((s) => streamServerUsableForPlayback(s) && usable.has(s.id))?.id ?? null;

  log(`move ${toMove.length} streams into dump folders`);
  await chunked(toMove, async (slice) => {
    await Promise.all(
      slice.map((row) =>
        prisma.stream.update({
          where: { id: row.id },
          data: { categoryId: row.categoryId, name: row.name },
        })
      )
    );
  });

  log(`create ${toCreate.length} missing dump streams`);
  for (let i = 0; i < toCreate.length; i++) {
    const s = toCreate[i]!;
    const streamUrl = dumpUrl(s.streamUrl);
    const name = String(s.name ?? "").trim();
    if (!name || !streamUrl) continue;
    const type =
      s.type === "MOVIE" ? StreamType.MOVIE : s.type === "SERIES" ? StreamType.SERIES : StreamType.LIVE;
    const isVod = type === StreamType.MOVIE || type === StreamType.SERIES;
    const categoryId = s.categoryLegacyId ? categoryIdByLegacy.get(s.categoryLegacyId) ?? null : null;
    const created = await prisma.stream.create({
      data: {
        name,
        streamUrl,
        backupUrl: s.backupUrl || null,
        streamIcon: s.streamIcon || null,
        type,
        sortOrder: Number(s.sortOrder) || 0,
        serverId: pickMigrateStreamServerId(undefined, usable, fallback ?? undefined) ?? null,
        categoryId,
        epgChannelId: s.epgChannelId || null,
        channelId: s.channelId || s.legacyId,
        containerExtension: s.containerExtension || (isVod ? "mp4" : "ts"),
        isActive: s.isActive !== false,
        isAdult: s.isAdult === true,
        isRadio: s.isRadio === true,
        isOnDemand: isVod,
        autoRestart: true,
        seriesName: s.seriesName?.trim() || null,
        seasonNum: s.seasonNum ?? null,
        episodeNum: s.episodeNum ?? null,
        vodMode: isVod ? VodMode.ON_DEMAND : VodMode.LIVE,
      },
    });
    keepIds.add(created.id);
    streamIdByLegacy.set(s.legacyId, created.id);
    if ((i + 1) % 200 === 0) log(`  created ${i + 1}/${toCreate.length}`);
  }

  log("overwrite bouquet membership from dump");
  for (const b of bundle.bouquets) {
    const name = String(b.name ?? "").trim();
    if (!name) continue;
    let bouquet = await prisma.bouquet.findFirst({ where: { name } });
    if (!bouquet) {
      bouquet = await prisma.bouquet.create({
        data: { name, sortOrder: Number(b.sortOrder) || 0, isActive: true },
      });
    } else if (bouquet.sortOrder !== (Number(b.sortOrder) || 0)) {
      await prisma.bouquet.update({
        where: { id: bouquet.id },
        data: { sortOrder: Number(b.sortOrder) || 0 },
      });
    }
    const rows: { bouquetId: string; streamId: string; sortOrder: number }[] = [];
    const seen = new Set<string>();
    for (const legacy of b.streamLegacyIds ?? []) {
      const streamId = streamIdByLegacy.get(String(legacy));
      if (!streamId || seen.has(streamId)) continue;
      seen.add(streamId);
      rows.push({ bouquetId: bouquet.id, streamId, sortOrder: rows.length });
    }
    await prisma.bouquetStream.deleteMany({ where: { bouquetId: bouquet.id } });
    for (let i = 0; i < rows.length; i += BATCH) {
      await prisma.bouquetStream.createMany({
        data: rows.slice(i, i + BATCH),
        skipDuplicates: true,
      });
    }
    log(`  bouquet ${name}: ${rows.length} streams`);
  }

  if (extraBouquets.length) {
    for (const extra of extraBouquets) {
      const destName = LINE_REMAP[extra.name];
      if (!destName) continue;
      const dest = await prisma.bouquet.findFirst({ where: { name: destName } });
      if (!dest) {
        log(`no dump bouquet ${destName} to remap ${extra.name}`);
        continue;
      }
      const links = await prisma.lineBouquet.findMany({
        where: { bouquetId: extra.id },
        select: { lineId: true },
      });
      if (!links.length) continue;
      await prisma.lineBouquet.createMany({
        data: links.map((l) => ({ lineId: l.lineId, bouquetId: dest.id })),
        skipDuplicates: true,
      });
      log(`remapped ${links.length} lines ${extra.name} → ${destName}`);
    }
    log(`delete ${extraBouquets.length} extra bouquets`);
    await prisma.bouquet.deleteMany({ where: { id: { in: extraBouquets.map((b) => b.id) } } });
  }

  const extrasNow = (await prisma.stream.findMany({ select: { id: true } }))
    .map((r) => r.id)
    .filter((id) => !keepIds.has(id));
  log(`delete ${extrasNow.length} extra streams`);
  await chunked(extrasNow, async (slice) => {
    await prisma.line.updateMany({
      where: { lastWatchedStreamId: { in: slice } },
      data: { lastWatchedStreamId: null },
    });
    await prisma.stream.deleteMany({ where: { id: { in: slice } } });
  });

  const leftoverCats = await prisma.category.findMany({
    where: { id: { notIn: [...keepCategoryIds] } },
    select: { id: true },
  });
  log(`delete ${leftoverCats.length} extra categories`);
  await deleteCategoriesSafe(leftoverCats.map((c) => c.id));

  const [streams, cats, bouquets, links] = await Promise.all([
    prisma.stream.count(),
    prisma.category.count(),
    prisma.bouquet.count(),
    prisma.bouquetStream.count(),
  ]);
  log(JSON.stringify({ done: true, streams, categories: cats, bouquets, bouquetLinks: links }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
