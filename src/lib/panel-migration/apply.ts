import { LineStatus, PanelRole, StreamType } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import { applyMigrationPhase2 } from "./phase2";
import { applyMigrationPhase3 } from "./apply-phase3";
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
    if (!serverId) {
      const first = await prisma.streamServer.findFirst().catch(() => null);
      serverId = first?.id ?? undefined;
    }

    await runEach(
      bundle.streams,
      async (s, idx) => {
        const name = String(s.name ?? "").trim();
        const streamUrl = String(s.streamUrl ?? "").trim();
        if (!name || !streamUrl || !s.legacyId) return false;
        if (options.skipExistingStreams) {
          const dup = await prisma.stream.findFirst({ where: { name, streamUrl } });
          if (dup) {
            streamIdByLegacy.set(s.legacyId, dup.id);
            return false;
          }
        }
        const type =
          s.type === "MOVIE" ? StreamType.MOVIE : s.type === "SERIES" ? StreamType.SERIES : StreamType.LIVE;
        const categoryId = s.categoryLegacyId ? categoryIdByLegacy.get(s.categoryLegacyId) : undefined;
        const mappedServerId = s.serverLegacyId
          ? serverIdByLegacy.get(s.serverLegacyId)
          : undefined;
        const created = await prisma.stream.create({
          data: {
            name,
            streamUrl,
            backupUrl: s.backupUrl?.trim() || null,
            streamIcon: s.streamIcon?.trim() || null,
            type,
            sortOrder: Number.isFinite(s.sortOrder) ? Number(s.sortOrder) : idx,
            serverId: mappedServerId ?? serverId ?? null,
            categoryId: categoryId ?? null,
            epgChannelId: s.epgChannelId?.trim() || null,
            channelId: s.channelId?.trim() || null,
            containerExtension: s.containerExtension?.trim() || null,
            isActive:
              options.importStreamsStopped !== false
                ? false
                : s.isActive !== false,
            isAdult: s.isAdult === true,
            isRadio: s.isRadio === true,
            seriesName: s.seriesName?.trim() || null,
            seasonNum: s.seasonNum ?? null,
            episodeNum: s.episodeNum ?? null,
            vodMode:
              type === StreamType.MOVIE || type === StreamType.SERIES
                ? "ON_DEMAND"
                : "LIVE",
          },
        });
        streamIdByLegacy.set(s.legacyId, created.id);
        return true;
      },
      (c, t) => options.onProgress?.("streams", c, t),
      result.streams,
      result.warnings,
      "Stream"
    );

    const linkRows: { bouquetId: string; streamId: string; sortOrder: number }[] = [];
    for (const b of bundle.bouquets) {
      const bouquetId = bouquetIdByLegacy.get(b.legacyId);
      if (!bouquetId) continue;
      for (let idx = 0; idx < (b.streamLegacyIds?.length ?? 0); idx++) {
        const streamId = streamIdByLegacy.get(String(b.streamLegacyIds[idx]));
        if (!streamId) continue;
        linkRows.push({ bouquetId, streamId, sortOrder: idx });
      }
    }
    const LINK_BATCH = 500;
    for (let i = 0; i < linkRows.length; i += LINK_BATCH) {
      try {
        await prisma.bouquetStream.createMany({
          data: linkRows.slice(i, i + LINK_BATCH),
          skipDuplicates: true,
        });
      } catch (e) {
        pushWarning(result.warnings, `Bouquet-stream links batch ${i}: ${shortErr(e)}`);
      }
    }
  }

  if (options.importResellers !== false && bundle.resellers?.length) {
    await runEach(
      bundle.resellers,
      async (r) => {
        const username = String(r.username ?? "").trim();
        const password = String(r.password ?? "").trim();
        if (!username || !password) return false;
        const exists = await prisma.panelUser.findUnique({ where: { username } });
        if (exists) {
          if (r.legacyId) resellerIdByLegacy.set(r.legacyId, exists.id);
          return false;
        }
        const pw = await hashPassword(password);
        const created = await prisma.panelUser.create({
          data: {
            username,
            passwordHash: pw,
            role: PanelRole.RESELLER,
            credits: Number(r.credits) || 0,
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

    // Second pass: parent tree links
    for (const r of bundle.resellers) {
      if (!r.legacyId || !r.parentLegacyId) continue;
      const id = resellerIdByLegacy.get(r.legacyId);
      const parentId = resellerIdByLegacy.get(r.parentLegacyId);
      if (!id || !parentId || id === parentId) continue;
      try {
        await prisma.panelUser.update({ where: { id }, data: { parentId } });
      } catch {
        /* ignore cycle/FK */
      }
    }
  }

  if (options.importLines !== false) {
    const existingLines = await prisma.line.findMany({
      select: { id: true, username: true, externalId: true },
    });
    const byUsername = new Map(existingLines.map((l) => [l.username, l]));
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

        const existing = byUsername.get(username);
        if (existing && options.skipExistingLines !== false) return false;

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
          allowedOutput: l.allowedOutput?.trim() || "ts,hls,m3u8",
          isTrial: l.isTrial === true,
          isRestreamer: l.isRestreamer === true,
          allowedUserAgents: l.allowedUserAgents?.trim() || null,
          disallowedUserAgents: l.disallowedUserAgents?.trim() || null,
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

        if (bouquetIds.length) {
          await prisma.lineBouquet
            .createMany({
              data: bouquetIds.map((bouquetId) => ({ lineId, bouquetId })),
              skipDuplicates: true,
            })
            .catch((e) => {
              pushWarning(result.warnings, `Line ${username} bouquets: ${shortErr(e)}`);
            });
        }
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

  const packageRows = [
    ...new Map(
      [...(bundle.packages ?? []), ...(bundle.phase2?.packages ?? [])].map((p) => [
        String(p.legacyId),
        p,
      ])
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
        if (existing) return false;
        const bouquetIds = [
          ...new Set(
            (p.bouquetLegacyIds ?? [])
              .map((id) => bouquetIdByLegacy.get(String(id)))
              .filter((id): id is string => Boolean(id))
          ),
        ];
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
      await applyMigrationPhase3(bundle.phase3, {
        options,
        result,
        streamIdByLegacy,
        categoryIdByLegacy,
        serverIdByLegacy,
        epgSourceIdByLegacy,
        resellerIdByLegacy,
        lineIdByLegacy,
      });
    } catch (e) {
      pushWarning(result.warnings, `Phase3 error: ${shortErr(e)}`);
    }
  }

  return result;
}
