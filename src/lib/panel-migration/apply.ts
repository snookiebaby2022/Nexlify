import { LineStatus, PanelRole, StreamType, VodMode } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword } from "../password-hash";
import {
  extraSourcesToBitrates,
  fillMissingStreamFields,
  isPendingStreamUrl,
  migrationStreamIdentityKeys,
} from "./stream-source-urls";
import { applyMigrationPhase2 } from "./phase2";
import { applyMigrationPhase3 } from "./apply-phase3";
import { urlsFromPhpSerialized, looksLikePlayableUrl } from "./sql-junctions";
import { migrationCreditBalance, resellerCreditUpdate } from "./map-rows";
import { pickMigrateStreamServerId, usableMigrateStreamServerIds, streamServerUsableForPlayback } from "./migrate-stream-server";
import { normalizeUserAgentField } from "../line-restrictions";
import { normalizeAllowedOutputInput } from "../line-access-output";
import type {
  MigrationApplyOptions,
  MigrationApplyResult,
  MigrationBundle,
} from "./types";

function emptyResult(): MigrationApplyResult {
  return {
    bouquets: { imported: 0, skipped: 0 },
    streams: { imported: 0, skipped: 0 },
    lines: { imported: 0, skipped: 0 },
    resellers: { imported: 0, skipped: 0 },
    magDevices: { imported: 0, skipped: 0 },
    enigmaDevices: { imported: 0, skipped: 0 },
    categories: { imported: 0, skipped: 0 },
    servers: { imported: 0, skipped: 0 },
    epgSources: { imported: 0, skipped: 0 },
    packages: { imported: 0, skipped: 0 },
    providers: { imported: 0, skipped: 0 },
    watchFolders: { imported: 0, skipped: 0 },
    tickets: { imported: 0, skipped: 0 },
    epgPrograms: { imported: 0, skipped: 0 },
    blockedAsns: { imported: 0, skipped: 0 },
    activityLogs: { imported: 0, skipped: 0 },
    bandwidthSnapshots: { imported: 0, skipped: 0 },
    settings: { imported: 0, skipped: 0 },
    accessCodes: { imported: 0, skipped: 0 },
    blockedUserAgents: { imported: 0, skipped: 0 },
    userGroups: { imported: 0, skipped: 0 },
    liveConnections: { imported: 0, skipped: 0 },
    onDemandStreams: { imported: 0, skipped: 0 },
    extrasBlobs: { imported: 0, skipped: 0 },
    warnings: [],
  };
}

const MAX_WARNINGS = 80;

export function safeDate(val: unknown, fallbackDays = 365): Date {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    if (y >= 1970 && y <= 9999) return val;
  }
  if (typeof val === "string" && val.trim()) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      if (y >= 1970 && y <= 9999) return d;
    }
  }
  const n = Number(val);
  if (Number.isFinite(n) && n > 0) {
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      if (y >= 1970 && y <= 9999) return d;
    }
  }
  return new Date(Date.now() + fallbackDays * 86400000);
}

function shortErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").slice(0, 220);
}

function pushWarning(warnings: string[], msg: string) {
  if (warnings.length >= MAX_WARNINGS) {
    if (warnings.length === MAX_WARNINGS) warnings.push("Further per-row warnings omitted.");
    return;
  }
  warnings.push(msg);
}

type ExistingStreamRow = {
  id: string;
  streamUrl: string;
  name: string;
  type: StreamType;
  categoryId: string | null;
  sortOrder: number;
  vodMode: VodMode;
  isOnDemand: boolean;
  autoRestart: boolean;
  isRadio: boolean;
  isAdult: boolean;
  seriesName: string | null;
  seasonNum: number | null;
  episodeNum: number | null;
  serverId: string | null;
  backupUrl: string | null;
  streamIcon: string | null;
  containerExtension: string | null;
  epgChannelId: string | null;
  channelId: string | null;
};

/** Omit streamIcon — huge/invalid values crash Prisma (`napi string`) and abort the whole import. */
const MIGRATE_STREAM_PRELOAD_SELECT = {
  id: true,
  streamUrl: true,
  name: true,
  type: true,
  categoryId: true,
  sortOrder: true,
  vodMode: true,
  isOnDemand: true,
  autoRestart: true,
  isRadio: true,
  isAdult: true,
  seriesName: true,
  seasonNum: true,
  episodeNum: true,
  serverId: true,
  backupUrl: true,
  containerExtension: true,
  epgChannelId: true,
  channelId: true,
} as const;

const STREAM_PRELOAD_BATCH = 1500;

async function loadExistingMigrateStreams(
  onProgress?: (phase: string, current: number, total: number) => void,
  warnings: string[] = []
): Promise<ExistingStreamRow[]> {
  const total = await prisma.stream.count();
  const rows: ExistingStreamRow[] = [];
  if (total === 0) return rows;

  let cursor: string | undefined;
  while (rows.length < total) {
    let take = STREAM_PRELOAD_BATCH;
    let batch: Array<Omit<ExistingStreamRow, "streamIcon">> | null = null;
    while (take >= 1) {
      try {
        batch = await prisma.stream.findMany({
          take,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: "asc" },
          select: MIGRATE_STREAM_PRELOAD_SELECT,
        });
        break;
      } catch (e) {
        if (take === 1) {
          const skipped = await prisma.stream.findMany({
            take: 1,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: { id: true },
          });
          if (!skipped.length) {
            pushWarning(warnings, `Stream preload stopped: ${shortErr(e)}`);
            return rows;
          }
          cursor = skipped[0]!.id;
          pushWarning(warnings, `Skipped unreadable stream ${cursor} during preload (${shortErr(e)})`);
          batch = [];
          break;
        }
        take = Math.max(1, Math.floor(take / 4));
      }
    }
    if (!batch) break;
    if (batch.length === 0) continue;
    for (const row of batch) rows.push({ ...row, streamIcon: null });
    cursor = batch[batch.length - 1]!.id;
    onProgress?.("streams", rows.length, total);
    if (batch.length < take && take === STREAM_PRELOAD_BATCH) break;
  }
  return rows;
}

/**
 * Import each row independently. NEVER wrap many Prisma writes in one
 * interactive transaction — a single unique/FK failure aborts the Postgres
 * transaction (25P02) and kills the rest of the import.
 */
async function runEach<T>(
  items: T[],
  handler: (item: T, idx: number) => Promise<boolean>,
  onProgress: (current: number, total: number) => void,
  resultCounter: { imported: number; skipped: number },
  warnings: string[],
  label: string
) {
  for (let idx = 0; idx < items.length; idx++) {
    onProgress(idx + 1, items.length);
    try {
      const success = await handler(items[idx], idx);
      if (success) resultCounter.imported++;
      else resultCounter.skipped++;
    } catch (e) {
      resultCounter.skipped++;
      pushWarning(warnings, `${label} #${idx}: ${shortErr(e)}`);
    }
  }
}

async function safeClearIptvData(warnings: string[]) {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["liveConnection", () => prisma.liveConnection.deleteMany()],
    ["lbSession", () => prisma.loadBalancerSession.deleteMany()],
    ["lineChannelWatch", () => prisma.lineChannelWatch.deleteMany()],
    ["streamFingerprint", () => prisma.streamFingerprint.deleteMany()],
    ["deviceBinding", () => prisma.deviceBinding.deleteMany()],
    ["sameIpDetection", () => prisma.sameIpDetection.deleteMany()],
    ["lineAppsLock", () => prisma.lineAppsLock.deleteMany()],
    ["enigmaDevice", () => prisma.enigmaDevice.deleteMany()],
    ["magDevice", () => prisma.magDevice.deleteMany()],
    ["lineBouquet", () => prisma.lineBouquet.deleteMany()],
    ["bouquetStream", () => prisma.bouquetStream.deleteMany()],
    ["resellerBouquet", () => prisma.resellerBouquet.deleteMany()],
    [
      "activityLog.line",
      () => prisma.activityLog.updateMany({ where: { lineId: { not: null } }, data: { lineId: null } }),
    ],
    [
      "billingEvent.line",
      () => prisma.billingEvent.updateMany({ where: { lineId: { not: null } }, data: { lineId: null } }),
    ],
    [
      "ticket.line",
      () => prisma.ticket.updateMany({ where: { lineId: { not: null } }, data: { lineId: null } }),
    ],
    [
      "aiSupportChat.line",
      () => prisma.aiSupportChat.updateMany({ where: { lineId: { not: null } }, data: { lineId: null } }),
    ],
    [
      "connectionGeography",
      () => prisma.connectionGeography.updateMany({ data: { lineId: null, streamId: null } }),
    ],
    ["line.lastWatched", () => prisma.line.updateMany({ data: { lastWatchedStreamId: null } })],
    ["streamProcess", () => prisma.streamProcess.deleteMany()],
    ["streamHealthCheck", () => prisma.streamHealthCheck.deleteMany()],
    ["streamIssue", () => prisma.streamIssue.deleteMany()],
    ["sourceMonitorAlert", () => prisma.sourceMonitorAlert.deleteMany()],
    ["moderationFlag", () => prisma.moderationFlag.deleteMany()],
    ["tmdbSyncJob.stream", () => prisma.tmdbSyncJob.updateMany({ data: { streamId: null } })],
    ["epgAutoAssignment.stream", () => prisma.epgAutoAssignment.updateMany({ data: { streamId: null } })],
    [
      "aiTranscodeSuggestion.stream",
      () => prisma.aiTranscodeSuggestion.updateMany({ data: { streamId: null } }),
    ],
    ["line", () => prisma.line.deleteMany()],
    ["stream", () => prisma.stream.deleteMany()],
    ["bouquet", () => prisma.bouquet.deleteMany()],
    [
      "category",
      async () => {
        const { clearAllCategoriesSafe } = await import("@/lib/category-tree");
        await clearAllCategoriesSafe();
      },
    ],
    ["epgProgram", () => prisma.epgProgram.deleteMany()],
    ["epgSource", () => prisma.epgSource.deleteMany()],
  ];
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (e) {
      pushWarning(warnings, `Clear ${name}: ${shortErr(e)}`);
    }
  }
}

export async function applyMigrationBundle(
  bundle: MigrationBundle,
  options: MigrationApplyOptions
): Promise<MigrationApplyResult> {
  const result = emptyResult();
  try {
    return await applyMigrationBundleInner(bundle, options, result);
  } catch (e) {
    pushWarning(result.warnings, `Import recovered from unexpected error: ${shortErr(e)}`);
    const processed = result.streams.imported + result.streams.skipped;
    if (processed === 0 && (bundle.streams?.length ?? 0) > 0) {
      throw e;
    }
    return result;
  }
}

async function applyMigrationBundleInner(
  bundle: MigrationBundle,
  options: MigrationApplyOptions,
  result: MigrationApplyResult
): Promise<MigrationApplyResult> {
  if (options.clearDataBeforeImport) {
    options.onProgress?.("clearing", 0, 1);
    await safeClearIptvData(result.warnings);
    options.onProgress?.("clearing", 1, 1);
  }

  let categoryIdByLegacy = new Map<string, string>();
  let serverIdByLegacy = new Map<string, string>();
  let epgSourceIdByLegacy = new Map<string, string>();

  if (bundle.phase2) {
    try {
      const phase2Out = await applyMigrationPhase2(bundle.phase2, {
        importCategories: options.importCategories !== false,
        importServers: options.importServers !== false,
        importEpg: options.importEpg !== false,
        skipExisting: options.skipExistingStreams !== false,
        onProgress: options.onProgress,
      });
      result.categories = phase2Out.result.categories;
      result.servers = phase2Out.result.servers;
      result.epgSources = phase2Out.result.epgSources;
      categoryIdByLegacy = phase2Out.categoryIdByLegacy;
      serverIdByLegacy = phase2Out.serverIdByLegacy;
      epgSourceIdByLegacy = phase2Out.epgSourceIdByLegacy ?? new Map();
      if (Array.isArray(phase2Out.result.warnings)) {
        result.warnings.push(...phase2Out.result.warnings);
      }
    } catch (e) {
      pushWarning(result.warnings, `Phase2 error: ${shortErr(e)}`);
    }
  }

  let fallbackServerId = options.defaultServerId?.trim() || undefined;
  const usableServerIds = await usableMigrateStreamServerIds([
    ...serverIdByLegacy.values(),
    fallbackServerId ?? "",
  ]);
  if (!fallbackServerId || !usableServerIds.has(fallbackServerId)) {
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
    const local = panelServers.find((s) => streamServerUsableForPlayback(s));
    if (local) {
      usableServerIds.add(local.id);
      if (!fallbackServerId || !usableServerIds.has(fallbackServerId)) {
        fallbackServerId = local.id;
      }
    }
  }

  const bouquetIdByLegacy = new Map<string, string>();
  const streamIdByLegacy = new Map<string, string>();
  const resellerIdByLegacy = new Map<string, string>();
  const lineIdByLegacy = new Map<string, string>();

  if (options.importBouquets !== false) {
    const seenNames = new Set<string>();
    await runEach(
      bundle.bouquets,
      async (b) => {
        const name = String(b.name ?? "").trim();
        if (!name || !b.legacyId) return false;
        if (seenNames.has(name)) {
          const dup = await prisma.bouquet.findFirst({ where: { name } });
          if (dup) bouquetIdByLegacy.set(b.legacyId, dup.id);
          return false;
        }
        seenNames.add(name);
        const existing = await prisma.bouquet.findFirst({ where: { name } });
        if (existing) {
          bouquetIdByLegacy.set(b.legacyId, existing.id);
          const nextOrder = Number(b.sortOrder) || 0;
          if (existing.sortOrder !== nextOrder) {
            await prisma.bouquet.update({
              where: { id: existing.id },
              data: { sortOrder: nextOrder },
            });
          }
          return false;
        }
        const created = await prisma.bouquet.create({
          data: { name, sortOrder: Number(b.sortOrder) || 0, isActive: true },
        });
        bouquetIdByLegacy.set(b.legacyId, created.id);
        return true;
      },
      (c, t) => options.onProgress?.("bouquets", c, t),
      result.bouquets,
      result.warnings,
      "Bouquet"
    );
  }

  if (options.importStreams !== false) {
    let serverId = options.defaultServerId ?? undefined;
    if (serverId) {
      const exists = await prisma.streamServer.findUnique({ where: { id: serverId } }).catch(() => null);
      if (!exists) serverId = undefined;
    }
    if (serverId) usableServerIds.add(serverId);
    if (!serverId) serverId = fallbackServerId;

    // Preload URL → stream so Skip existing does not run findFirst+update per row
    // (that path was ~10 streams/sec on large panels).
    options.onProgress?.("streams", 0, bundle.streams.length);
    const existingRows = await loadExistingMigrateStreams(options.onProgress, result.warnings);
    const byKey = new Map<string, ExistingStreamRow>();
    const rememberStream = (row: ExistingStreamRow, extraLegacy?: string | null) => {
      for (const k of migrationStreamIdentityKeys({
        streamUrl: row.streamUrl,
        channelId: row.channelId,
        legacyId: extraLegacy,
        source: bundle.source,
      })) {
        if (!byKey.has(k)) byKey.set(k, row);
      }
    };
    for (const row of existingRows) rememberStream(row);
    const findExistingStream = (
      streamUrl: string,
      legacyId: string,
      channelId?: string | null
    ): ExistingStreamRow | undefined => {
      for (const k of migrationStreamIdentityKeys({
        streamUrl,
        legacyId,
        channelId,
        source: bundle.source,
      })) {
        const hit = byKey.get(k);
        if (hit) return hit;
      }
      return undefined;
    };
    const skipExistingStreams = options.skipExistingStreams !== false;

    await runEach(
      bundle.streams,
      async (s, idx) => {
        const name = String(s.name ?? "").trim();
        let streamUrl = String(s.streamUrl ?? "").trim();
        if (/^(a|O|C):\d+:\{/.test(streamUrl) || /^s:\d+:"/.test(streamUrl)) {
          streamUrl = urlsFromPhpSerialized(streamUrl)[0] ?? "";
        }
        if (!name || !streamUrl || !s.legacyId) return false;
        // Reject XUI empty-source placeholders that slipped through older mappers
        if (
          streamUrl === "0" ||
          streamUrl.toLowerCase() === "null" ||
          /^-?\d+(\.\d+)?$/.test(streamUrl)
        ) {
          return false;
        }
        if (!looksLikePlayableUrl(streamUrl) && !streamUrl.startsWith("pending://")) {
          const php = urlsFromPhpSerialized(streamUrl)[0];
          if (php) streamUrl = php;
          else return false;
        }
        const type =
          s.type === "MOVIE" ? StreamType.MOVIE : s.type === "SERIES" ? StreamType.SERIES : StreamType.LIVE;
        const categoryId = s.categoryLegacyId ? categoryIdByLegacy.get(s.categoryLegacyId) : undefined;
        const mappedServerId = pickMigrateStreamServerId(
          s.serverLegacyId ? serverIdByLegacy.get(s.serverLegacyId) : undefined,
          usableServerIds,
          serverId
        );
        const isVod = type === StreamType.MOVIE || type === StreamType.SERIES;
        const vodMode = isVod ? VodMode.ON_DEMAND : VodMode.LIVE;
        const isOnDemand = isVod;
        const autoRestart = true;
        const isRadio = s.isRadio === true;
        const isAdult = s.isAdult === true;
        const seriesName = s.seriesName?.trim() || null;
        const seasonNum = s.seasonNum ?? null;
        const episodeNum = s.episodeNum ?? null;
        const backupUrl = s.backupUrl?.trim() || null;
        const streamIcon = s.streamIcon?.trim() || null;
        const containerExtension = s.containerExtension?.trim() || null;
        const epgChannelId = s.epgChannelId?.trim() || null;
        const sortOrder = Number.isFinite(s.sortOrder) ? Number(s.sortOrder) : idx;

        const bitrates = extraSourcesToBitrates(s.extraSourceUrls);
        const dumpChannelId = s.channelId?.trim() || null;
        const dup = findExistingStream(streamUrl, s.legacyId, dumpChannelId);
        if (dup) {
          streamIdByLegacy.set(s.legacyId, dup.id);
          rememberStream(dup, s.legacyId);
          const fill = fillMissingStreamFields(
            {
              streamUrl: dup.streamUrl,
              categoryId: dup.categoryId,
              serverId: dup.serverId,
              backupUrl: dup.backupUrl,
              streamIcon: dup.streamIcon,
              containerExtension: dup.containerExtension,
              epgChannelId: dup.epgChannelId,
              channelId: dup.channelId,
            },
            {
              streamUrl,
              categoryId: categoryId ?? null,
              serverId: mappedServerId ?? null,
              backupUrl,
              streamIcon,
              containerExtension,
              epgChannelId,
              channelId: dumpChannelId,
            }
          );
          if (skipExistingStreams) {
            if (Object.keys(fill).length === 0) return false;
            try {
              await prisma.stream.update({
                where: { id: dup.id },
                data: fill,
              });
              rememberStream({ ...dup, ...fill }, s.legacyId);
            } catch (e) {
              pushWarning(result.warnings, `Fill existing stream ${name}: ${shortErr(e)}`);
            }
            return false;
          }
          const nextCategoryId = categoryId ?? dup.categoryId;
          const nextServerId = mappedServerId ?? dup.serverId;
          const nextBackup = backupUrl || dup.backupUrl;
          const nextIcon = streamIcon || dup.streamIcon;
          const nextExt = containerExtension || dup.containerExtension;
          const nextEpg = epgChannelId || dup.epgChannelId;
          const nextChannelId = dumpChannelId || dup.channelId;
          const dumpRealUrl = !isPendingStreamUrl(streamUrl);
          const nextUrl = dumpRealUrl ? streamUrl : dup.streamUrl;
          const needsUpdate =
            dup.name !== name ||
            dup.type !== type ||
            dup.vodMode !== vodMode ||
            dup.isOnDemand !== isOnDemand ||
            dup.autoRestart !== autoRestart ||
            dup.isRadio !== isRadio ||
            dup.isAdult !== isAdult ||
            dup.seriesName !== seriesName ||
            dup.seasonNum !== seasonNum ||
            dup.episodeNum !== episodeNum ||
            dup.categoryId !== nextCategoryId ||
            dup.serverId !== nextServerId ||
            dup.backupUrl !== nextBackup ||
            dup.streamIcon !== nextIcon ||
            dup.containerExtension !== nextExt ||
            dup.epgChannelId !== nextEpg ||
            dup.channelId !== nextChannelId ||
            dup.streamUrl !== nextUrl ||
            dup.sortOrder !== sortOrder;
          if (!needsUpdate) return false;
          try {
            await prisma.stream.update({
              where: { id: dup.id },
              data: {
                name,
                type,
                vodMode,
                isOnDemand,
                autoRestart,
                isRadio,
                isAdult,
                seriesName,
                seasonNum,
                episodeNum,
                categoryId: nextCategoryId,
                serverId: nextServerId,
                backupUrl: nextBackup,
                ...(bitrates ? { bitrates } : {}),
                streamIcon: nextIcon,
                containerExtension: nextExt,
                epgChannelId: nextEpg,
                channelId: nextChannelId,
                sortOrder,
                ...(nextUrl !== dup.streamUrl ? { streamUrl: nextUrl } : {}),
              },
            });
            rememberStream(
              {
                ...dup,
                name,
                type,
                vodMode,
                isOnDemand,
                autoRestart,
                isRadio,
                isAdult,
                seriesName,
                seasonNum,
                episodeNum,
                categoryId: nextCategoryId,
                serverId: nextServerId,
                backupUrl: nextBackup,
                streamIcon: nextIcon,
                containerExtension: nextExt,
                epgChannelId: nextEpg,
                channelId: nextChannelId,
                streamUrl: nextUrl,
                sortOrder,
              },
              s.legacyId
            );
          } catch (e) {
            pushWarning(result.warnings, `Update existing stream ${name}: ${shortErr(e)}`);
          }
          return false;
        }
        const created = await prisma.stream.create({
          data: {
            name,
            streamUrl,
            backupUrl,
            streamIcon,
            type,
            sortOrder,
            serverId: mappedServerId ?? serverId ?? null,
            categoryId: categoryId ?? null,
            epgChannelId,
            channelId: dumpChannelId,
            containerExtension,
            isActive:
              options.importStreamsStopped === true
                ? false
                : s.isActive !== false,
            isAdult,
            isRadio,
            isOnDemand,
            autoRestart,
            seriesName,
            seasonNum,
            episodeNum,
            vodMode,
            ...(bitrates ? { bitrates } : {}),
            agentStartCmd: s.agentStartCmd?.trim() || null,
          },
        });
        streamIdByLegacy.set(s.legacyId, created.id);
        rememberStream(
          {
            id: created.id,
            streamUrl,
            name,
            type,
            categoryId: categoryId ?? null,
            sortOrder,
            vodMode,
            isOnDemand,
            autoRestart,
            isRadio,
            isAdult,
            seriesName,
            seasonNum,
            episodeNum,
            serverId: mappedServerId ?? serverId ?? null,
            backupUrl,
            streamIcon,
            containerExtension,
            epgChannelId,
            channelId: dumpChannelId,
          },
          s.legacyId
        );
        return true;
      },
      (c, t) => options.onProgress?.("streams", c, t),
      result.streams,
      result.warnings,
      "Stream"
    );

    // Skip-existing reimport: add missing bouquet membership only (keep panel extras).
    // Full replace when Clear data or Skip existing is off.
    const linksByBouquet = new Map<string, { streamId: string; sortOrder: number }[]>();
    for (const b of bundle.bouquets) {
      const bouquetId = bouquetIdByLegacy.get(b.legacyId);
      if (!bouquetId) continue;
      const rows: { streamId: string; sortOrder: number }[] = [];
      const seen = new Set<string>();
      for (let idx = 0; idx < (b.streamLegacyIds?.length ?? 0); idx++) {
        const streamId = streamIdByLegacy.get(String(b.streamLegacyIds[idx]));
        if (!streamId || seen.has(streamId)) continue;
        seen.add(streamId);
        rows.push({ streamId, sortOrder: rows.length });
      }
      linksByBouquet.set(bouquetId, rows);
    }
    const LINK_BATCH = 500;
    let bouquetLinkIdx = 0;
    const additiveLinks =
      options.skipExistingStreams !== false && options.clearDataBeforeImport !== true;
    for (const [bouquetId, rows] of linksByBouquet) {
      bouquetLinkIdx++;
      options.onProgress?.("bouquetLinks", bouquetLinkIdx, linksByBouquet.size);
      try {
        if (additiveLinks) {
          const existing = await prisma.bouquetStream.findMany({
            where: { bouquetId },
            select: { streamId: true, sortOrder: true },
          });
          const have = new Set(existing.map((e) => e.streamId));
          let nextOrder = existing.reduce((m, e) => Math.max(m, e.sortOrder), -1);
          const toAdd = rows.filter((r) => !have.has(r.streamId)).map((r) => {
            nextOrder += 1;
            return { bouquetId, streamId: r.streamId, sortOrder: nextOrder };
          });
          for (let i = 0; i < toAdd.length; i += LINK_BATCH) {
            await prisma.bouquetStream.createMany({
              data: toAdd.slice(i, i + LINK_BATCH),
              skipDuplicates: true,
            });
          }
        } else {
          await prisma.bouquetStream.deleteMany({ where: { bouquetId } });
          for (let i = 0; i < rows.length; i += LINK_BATCH) {
            await prisma.bouquetStream.createMany({
              data: rows.slice(i, i + LINK_BATCH).map((r) => ({
                bouquetId,
                streamId: r.streamId,
                sortOrder: r.sortOrder,
              })),
              skipDuplicates: true,
            });
          }
        }
      } catch (e) {
        pushWarning(result.warnings, `Bouquet links ${bouquetId}: ${shortErr(e)}`);
      }
    }
  }

          if (options.importResellers !== false && bundle.resellers?.length) {
    let resellerCreditsUpdated = 0;
    await runEach(
      bundle.resellers,
      async (r) => {
        const username = String(r.username ?? "").trim();
        const password = String(r.password ?? "").trim();
        if (!username || !password) return false;
        const exists = await prisma.panelUser.findUnique({ where: { username } });
        if (exists) {
          if (r.legacyId) resellerIdByLegacy.set(r.legacyId, exists.id);
          // Restore XUI crypt hashes that were mistakenly bcrypt'd on an earlier import.
          try {
            const { isPrehashedPassword } = await import("@/lib/password-verify");
            const { BCRYPT_HASH_RE } = await import("@/lib/secrets-equal");
            if (isPrehashedPassword(password) && password.startsWith("$6$") && BCRYPT_HASH_RE.test(exists.passwordHash)) {
              await prisma.panelUser.update({
                where: { id: exists.id },
                data: { passwordHash: password, passwordPlain: null },
              });
            }
          } catch {
            /* non-fatal */
          }
          // Skip-existing does not skip credit balances — a new SQL dump is the source of truth.
          const nextCredits = resellerCreditUpdate(exists.role, exists.credits, r.credits);
          if (nextCredits != null) {
            try {
              await prisma.panelUser.update({
                where: { id: exists.id },
                data: { credits: nextCredits },
              });
              await prisma.creditTransaction.create({
                data: {
                  userId: exists.id,
                  amount: nextCredits - exists.credits,
                  balanceAfter: nextCredits,
                  note: "SQL migration import",
                },
              });
              resellerCreditsUpdated++;
            } catch (e) {
              pushWarning(result.warnings, `Update credits ${username}: ${shortErr(e)}`);
            }
          }
          return false;
        }
        const { isPrehashedPassword } = await import("@/lib/password-verify");
        const prehashed = isPrehashedPassword(password);
        const pw = prehashed ? password : await hashPassword(password);
        const role = r.parentLegacyId ? PanelRole.SUB_RESELLER : PanelRole.RESELLER;
        const created = await prisma.panelUser.create({
          data: {
            username,
            passwordHash: pw,
            role,
            credits: migrationCreditBalance(r.credits),
            isActive: r.isActive !== false,
            email: r.email?.trim() || null,
            notes: r.notes?.trim() || null,
            maxLines: Number(r.maxLines) || 500,
            resellerDns: r.resellerDns?.trim() || null,
          },
        });
        if (r.legacyId) resellerIdByLegacy.set(r.legacyId, created.id);
        return true;
      },
      (c, t) => options.onProgress?.("resellers", c, t),
      result.resellers,
      result.warnings,
      "Reseller"
    );
    if (resellerCreditsUpdated > 0) {
      pushWarning(
        result.warnings,
        `Updated credit balances on ${resellerCreditsUpdated} existing reseller(s) from the dump.`
      );
    }

    // Second pass: parent tree links + promote sub-resellers
    for (const r of bundle.resellers) {
      if (!r.legacyId || !r.parentLegacyId) continue;
      const id = resellerIdByLegacy.get(r.legacyId);
      const parentId = resellerIdByLegacy.get(r.parentLegacyId);
      if (!id || !parentId || id === parentId) continue;
      try {
        await prisma.panelUser.update({
          where: { id },
          data: { parentId, role: PanelRole.SUB_RESELLER },
        });
      } catch {
        /* ignore cycle/FK */
      }
    }

    // Grant bouquet access so resellers can create lines immediately after migrate.
    const allBouquetIds = [...bouquetIdByLegacy.values()];
    const uniqueBouquetIds = [...new Set(allBouquetIds)];
    if (!uniqueBouquetIds.length) {
      const existing = await prisma.bouquet.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      uniqueBouquetIds.push(...existing.map((b) => b.id));
    }
    if (uniqueBouquetIds.length && resellerIdByLegacy.size) {
      const rows: { userId: string; bouquetId: string }[] = [];
      for (const userId of new Set(resellerIdByLegacy.values())) {
        for (const bouquetId of uniqueBouquetIds) {
          rows.push({ userId, bouquetId });
        }
      }
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        try {
          await prisma.resellerBouquet.createMany({
            data: rows.slice(i, i + BATCH),
            skipDuplicates: true,
          });
        } catch (e) {
          pushWarning(result.warnings, `Reseller bouquet access batch ${i}: ${shortErr(e)}`);
        }
      }
    }
  }

  if (options.importLines !== false) {
    const existingLines = await prisma.line.findMany({
      select: { id: true, username: true, externalId: true },
    });
    const byUsername = new Map(existingLines.map((l) => [l.username, l]));
    const byExternalId = new Map(
      existingLines
        .filter((l): l is typeof l & { externalId: string } => Boolean(l.externalId))
        .map((l) => [l.externalId, l])
    );
    const usedExternalIds = new Set(
      existingLines.map((l) => l.externalId).filter((id): id is string => Boolean(id))
    );
    const seenUsernames = new Set<string>();

    let ownerFallback: string | null = options.ownerId ?? null;
    if (ownerFallback) {
      const ownerOk = await prisma.panelUser.findUnique({ where: { id: ownerFallback } }).catch(() => null);
      if (!ownerOk) ownerFallback = null;
    }

    await runEach(
      bundle.lines,
      async (l) => {
        const username = String(l.username ?? "").trim();
        const password = String(l.password ?? "").trim();
        if (!username || !password) return false;
        if (seenUsernames.has(username)) return false;
        seenUsernames.add(username);

        const existing =
          byUsername.get(username) ??
          (l.legacyId?.trim() ? byExternalId.get(l.legacyId.trim()) : undefined);

        const status =
          l.status === "BANNED"
            ? LineStatus.BANNED
            : l.status === "DISABLED"
              ? LineStatus.DISABLED
              : l.status === "EXPIRED"
                ? LineStatus.EXPIRED
                : LineStatus.ACTIVE;

        const bouquetIds = [
          ...new Set(
            (l.bouquetLegacyIds ?? [])
              .map((id) => bouquetIdByLegacy.get(String(id)))
              .filter((id): id is string => Boolean(id))
          ),
        ];

        async function attachLineBouquets(lineId: string) {
          if (!bouquetIds.length) return;
          await prisma.lineBouquet
            .createMany({
              data: bouquetIds.map((bouquetId) => ({ lineId, bouquetId })),
              skipDuplicates: true,
            })
            .catch((e) => {
              pushWarning(result.warnings, `Line ${username} bouquets: ${shortErr(e)}`);
            });
        }

        if (existing && options.skipExistingLines !== false) {
          if (l.legacyId) lineIdByLegacy.set(String(l.legacyId), existing.id);
          await attachLineBouquets(existing.id);
          return false;
        }

        let ownerId: string | null =
          (l.ownerLegacyId ? resellerIdByLegacy.get(l.ownerLegacyId) : undefined) ?? ownerFallback;

        if (ownerId && ownerId !== ownerFallback) {
          const ok = await prisma.panelUser.findUnique({ where: { id: ownerId } }).catch(() => null);
          if (!ok) ownerId = ownerFallback;
        }

        let externalId = l.legacyId?.trim() || null;
        if (externalId && usedExternalIds.has(externalId) && existing?.externalId !== externalId) {
          externalId = null;
        }

        const data = {
          username,
          password,
          expiresAt: safeDate(l.expiresAt),
          maxConnections: Math.max(1, Number(l.maxConnections) || 1),
          status,
          ownerId,
          notes: l.notes?.trim() || null,
          allowedIps: l.allowedIps?.trim() || null,
          lockToIp: Boolean(l.lockToIp),
          canWatchAdult: l.canWatchAdult !== false,
          allowedCountries: l.allowedCountries?.trim() || null,
          blockedCountries: l.blockedCountries?.trim() || null,
          allowedOutput: normalizeAllowedOutputInput(l.allowedOutput) || "hls,m3u8,ts,rtmp",
          isTrial: l.isTrial === true,
          isRestreamer: l.isRestreamer === true,
          allowedUserAgents: normalizeUserAgentField(l.allowedUserAgents),
          disallowedUserAgents: normalizeUserAgentField(l.disallowedUserAgents),
          forcedServerId: l.forcedServerLegacyId
            ? serverIdByLegacy.get(l.forcedServerLegacyId) ?? null
            : null,
        };

        let lineId: string;
        if (existing) {
          await prisma.line.update({
            where: { id: existing.id },
            data: { ...data, ...(externalId ? { externalId } : {}) },
          });
          lineId = existing.id;
        } else {
          try {
            const created = await prisma.line.create({
              data: { ...data, externalId },
            });
            lineId = created.id;
          } catch (e) {
            const msg = shortErr(e);
            if (!/unique|external/i.test(msg)) throw e;
            const created = await prisma.line.create({
              data: { ...data, externalId: null },
            });
            lineId = created.id;
          }
          byUsername.set(username, { id: lineId, username, externalId });
        }
        if (externalId) usedExternalIds.add(externalId);
        if (l.legacyId) lineIdByLegacy.set(String(l.legacyId), lineId);

        await attachLineBouquets(lineId);
        return !existing;
      },
      (c, t) => options.onProgress?.("lines", c, t),
      result.lines,
      result.warnings,
      "Line"
    );
  }

  if (options.importMag !== false && bundle.magDevices?.length) {
    await runEach(
      bundle.magDevices,
      async (m) => {
        const mac = String(m.mac ?? "").trim().toUpperCase();
        const lineUsername = String(m.lineUsername ?? "").trim();
        if (!mac || !lineUsername) return false;
        const line = await prisma.line.findUnique({ where: { username: lineUsername } });
        if (!line) return false;
        const existingMag = await prisma.magDevice.findUnique({ where: { mac } });
        if (existingMag && options.skipExistingLines !== false) return false;
        await prisma.magDevice.upsert({
          where: { mac },
          create: { mac, lineId: line.id, model: m.model?.trim() || null },
          update: { lineId: line.id, model: m.model?.trim() || null },
        });
        return true;
      },
      (c, t) => options.onProgress?.("mag", c, t),
      result.magDevices,
      result.warnings,
      "MAG"
    );
  }

  if (options.importEnigma !== false && bundle.enigmaDevices?.length) {
    await runEach(
      bundle.enigmaDevices,
      async (m) => {
        const mac = String(m.mac ?? "").trim().toUpperCase();
        const lineUsername = String(m.lineUsername ?? "").trim();
        if (!mac || !lineUsername) return false;
        const line = await prisma.line.findUnique({ where: { username: lineUsername } });
        if (!line) return false;
        const existingEnigma = await prisma.enigmaDevice.findUnique({ where: { mac } });
        if (existingEnigma && options.skipExistingLines !== false) return false;
        await prisma.enigmaDevice.upsert({
          where: { mac },
          create: { mac, lineId: line.id, model: m.model?.trim() || null },
          update: { lineId: line.id, model: m.model?.trim() || null },
        });
        return true;
      },
      (c, t) => options.onProgress?.("enigma", c, t),
      result.enigmaDevices,
      result.warnings,
      "Enigma"
    );
  }

  // packages and phase2.packages are often the same array reference (SQL load).
  // Deduplicate by legacyId so preview/import never double-count users_packages.
  const packageRows = [
    ...new Map(
      [...(bundle.packages ?? []), ...(bundle.phase2?.packages ?? [])]
        .filter((p) => p?.legacyId)
        .map((p) => [String(p.legacyId), p] as const)
    ).values(),
  ];
  if (options.importPackages !== false && packageRows.length) {
    const seen = new Set<string>();
    await runEach(
      packageRows,
      async (p) => {
        const name = String(p.name ?? "").trim();
        if (!name || !p.legacyId || seen.has(name)) return false;
        seen.add(name);
        const existing = await prisma.package.findFirst({ where: { name } });
        const bouquetIds = [
          ...new Set(
            (p.bouquetLegacyIds ?? [])
              .map((id) => bouquetIdByLegacy.get(String(id)))
              .filter((id): id is string => Boolean(id))
          ),
        ];
        if (existing) {
          if (
            options.skipExistingStreams !== false &&
            options.clearDataBeforeImport !== true &&
            bouquetIds.length
          ) {
            const have = new Set((existing.bouquetIds ?? []).map(String));
            const merged = [...(existing.bouquetIds ?? [])];
            for (const id of bouquetIds) {
              if (!have.has(id)) merged.push(id);
            }
            if (merged.length !== (existing.bouquetIds ?? []).length) {
              await prisma.package.update({
                where: { id: existing.id },
                data: { bouquetIds: merged },
              });
            }
          }
          return false;
        }
        await prisma.package.create({
          data: {
            name,
            description: p.description?.trim() || null,
            days: Math.max(1, Number(p.days) || 30),
            creditCost: Math.max(0, Number(p.creditCost) || 0),
            maxLines: Math.max(1, Number(p.maxLines) || 1),
            bouquetIds,
            sortOrder: Number(p.sortOrder) || 0,
            isActive: p.isActive !== false,
          },
        });
        return true;
      },
      (c, t) => options.onProgress?.("packages", c, t),
      result.packages,
      result.warnings,
      "Package"
    );
  }

  if (bundle.phase3) {
    try {
      // Retag / Skip-existing reimports: do not re-bulk millions of EPG programmes,
      // activity logs, or stats — that alone can take hours. Use Repair + EPG sync instead.
      const retagOnly =
        options.skipExistingStreams !== false && options.clearDataBeforeImport !== true;
      const phase3Options = retagOnly
        ? {
            ...options,
            importEpgGuide: false,
            importLogs: false,
            importStats: false,
          }
        : options;
      if (retagOnly && options.importEpgGuide !== false) {
        pushWarning(
          result.warnings,
          "Skipped EPG programme / logs / stats re-import (Skip existing). Sync EPG from Sources if the guide needs refreshing."
        );
      }
      await applyMigrationPhase3(bundle.phase3, {
        options: phase3Options,
        result,
        streamIdByLegacy,
        categoryIdByLegacy,
        serverIdByLegacy,
        epgSourceIdByLegacy,
        resellerIdByLegacy,
        lineIdByLegacy,
        source: bundle.source,
      });
    } catch (e) {
      pushWarning(result.warnings, `Phase3 error: ${shortErr(e)}`);
    }
  }

  // Full Clear+import runs repair here. Skip-existing retags should use the Repair button
  // instead — repair walks the whole catalog and can take a long time on large panels.
  if (options.clearDataBeforeImport === true || options.skipExistingStreams === false) {
    try {
      options.onProgress?.("repair", 0, 1);
      const { repairImportedPanel } = await import("@/lib/repair-imported-panel");
      const repair = await repairImportedPanel(prisma);
      if (repair.liveLinkedToBouquets || repair.seriesLinkedToBouquets || repair.moviesLinkedToBouquets || repair.linesLinkedToBouquets) {
        pushWarning(
          result.warnings,
          `Post-import repair: linked ${repair.liveLinkedToBouquets} live, ${repair.moviesLinkedToBouquets} movie, ${repair.seriesLinkedToBouquets} series stream(s) into bouquets; attached ${repair.linesLinkedToBouquets} line-bouquet link(s); activated ${repair.streamsActivated}.`
        );
      }
      options.onProgress?.("repair", 1, 1);
    } catch (e) {
      pushWarning(result.warnings, `Post-import repair: ${shortErr(e)}`);
    }
  } else {
    pushWarning(
      result.warnings,
      "Skipped post-import repair (Skip existing). Click Repair existing import if bouquets/activation still need healing."
    );
  }

  return result;
}
