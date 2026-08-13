import { LineStatus, PanelRole, StreamType } from "@prisma/client";
import { prisma as globalPrisma } from "../prisma";
import { hashPassword } from "../auth";
import { applyMigrationPhase2 } from "./phase2";
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
    warnings: [],
  };
}

export async function applyMigrationBundle(
  bundle: MigrationBundle,
  options: MigrationApplyOptions
): Promise<MigrationApplyResult> {
  const run = async (prisma: { stream: any; bouquet: any; line: any; panelUser: any; magDevice: any; enigmaDevice: any; bouquetStream: any; category: any; streamServer: any; epgSource: any; [key: string]: any }) => {
    const result = emptyResult();

    // Clear all data before import if requested
    if (options.clearDataBeforeImport) {
      options.onProgress?.("clearing", 0, 1);
      // Delete in order to respect foreign keys
      await prisma.bouquetStream.deleteMany();
      await prisma.lineBouquet.deleteMany();
      await prisma.enigmaDevice.deleteMany();
      await prisma.magDevice.deleteMany();
      await prisma.line.deleteMany();
      await prisma.stream.deleteMany();
      await prisma.bouquet.deleteMany();
      await prisma.panelUser.deleteMany();
      await prisma.category.deleteMany();
      await prisma.streamServer.deleteMany();
      await prisma.epgSource.deleteMany();
      options.onProgress?.("clearing", 1, 1);
    }

    let categoryIdByLegacy = new Map<string, string>();

    if (bundle.phase2) {
      const phase2Out = await applyMigrationPhase2(bundle.phase2, {
        importCategories: options.importCategories !== false,
        importServers: options.importServers !== false,
        importEpg: options.importEpg !== false,
        skipExisting: options.skipExistingStreams !== false,
        tx: prisma,
        onProgress: options.onProgress,
      });
      result.categories = phase2Out.result.categories;
      result.servers = phase2Out.result.servers;
      result.epgSources = phase2Out.result.epgSources;
      categoryIdByLegacy = phase2Out.categoryIdByLegacy;
    }

    const bouquetIdByLegacy = new Map<string, string>();
    const streamIdByLegacy = new Map<string, string>();
    const resellerIdByLegacy = new Map<string, string>();

    if (options.importBouquets !== false) {
      for (let i = 0; i < bundle.bouquets.length; i++) {
        const b = bundle.bouquets[i];
        options.onProgress?.("bouquets", i + 1, bundle.bouquets.length);
        const existing = await prisma.bouquet.findFirst({
          where: { name: b.name },
        });
        if (existing) {
          bouquetIdByLegacy.set(b.legacyId, existing.id);
          result.bouquets.skipped++;
          continue;
        }
        const created = await prisma.bouquet.create({
          data: {
            name: b.name,
            sortOrder: b.sortOrder ?? 0,
            isActive: true,
          },
        });
        bouquetIdByLegacy.set(b.legacyId, created.id);
        result.bouquets.imported++;
      }
    }

    if (options.importStreams !== false) {
      for (let i = 0; i < bundle.streams.length; i++) {
        const s = bundle.streams[i];
        options.onProgress?.("streams", i + 1, bundle.streams.length);
        if (options.skipExistingStreams) {
          const dup = await prisma.stream.findFirst({
            where: { name: s.name, streamUrl: s.streamUrl },
          });
          if (dup) {
            streamIdByLegacy.set(s.legacyId, dup.id);
            result.streams.skipped++;
            continue;
          }
        }
        const type =
          s.type === "MOVIE"
            ? StreamType.MOVIE
            : s.type === "SERIES"
              ? StreamType.SERIES
              : StreamType.LIVE;

        const categoryId = s.categoryLegacyId
          ? categoryIdByLegacy.get(s.categoryLegacyId)
          : undefined;

        const serverId = options.defaultServerId ?? null;
        const sortOrder = s.sortOrder ?? i;

        const created = await prisma.stream.create({
          data: {
            name: s.name,
            streamUrl: s.streamUrl,
            streamIcon: s.streamIcon ?? null,
            type,
            sortOrder,
            serverId,
            categoryId: categoryId ?? null,
            epgChannelId: s.epgChannelId ?? null,
            channelId: s.channelId ?? null,
            containerExtension: s.containerExtension ?? null,
            isActive: s.isActive !== false,
          },
        });
        streamIdByLegacy.set(s.legacyId, created.id);
        result.streams.imported++;
      }

      for (const b of bundle.bouquets) {
        const bouquetId = bouquetIdByLegacy.get(b.legacyId);
        if (!bouquetId) continue;
        for (let idx = 0; idx < b.streamLegacyIds.length; idx++) {
          const sid = b.streamLegacyIds[idx];
          const streamId = streamIdByLegacy.get(String(sid));
          if (!streamId) continue;
          await prisma.bouquetStream.upsert({
            where: { bouquetId_streamId: { bouquetId, streamId } },
            create: { bouquetId, streamId, sortOrder: idx },
            update: { sortOrder: idx },
          });
        }
      }
    }

    if (options.importResellers !== false) {
      for (let i = 0; i < (bundle.resellers ?? []).length; i++) {
        const r = bundle.resellers![i];
        options.onProgress?.("resellers", i + 1, bundle.resellers!.length);
        const exists = await prisma.panelUser.findUnique({
          where: { username: r.username },
        });
        if (exists) {
          if (r.legacyId) resellerIdByLegacy.set(r.legacyId, exists.id);
          result.resellers.skipped++;
          continue;
        }
        const created = await prisma.panelUser.create({
          data: {
            username: r.username,
            passwordHash: await hashPassword(r.password),
            role: PanelRole.RESELLER,
            credits: r.credits ?? 0,
            isActive: r.isActive !== false,
          },
        });
        if (r.legacyId) resellerIdByLegacy.set(r.legacyId, created.id);
        result.resellers.imported++;
      }
    }

    if (options.importLines !== false) {
      for (let i = 0; i < bundle.lines.length; i++) {
        const l = bundle.lines[i];
        options.onProgress?.("lines", i + 1, bundle.lines.length);
        if (options.skipExistingLines) {
          const exists = await prisma.line.findUnique({
            where: { username: l.username },
          });
          if (exists) {
            result.lines.skipped++;
            continue;
          }
        }
        const status =
          l.status === "BANNED"
            ? LineStatus.BANNED
            : l.status === "DISABLED"
              ? LineStatus.DISABLED
              : l.status === "EXPIRED"
                ? LineStatus.EXPIRED
                : LineStatus.ACTIVE;

        const bouquetIds = (l.bouquetLegacyIds ?? [])
          .map((id) => bouquetIdByLegacy.get(String(id)))
          .filter(Boolean) as string[];

        const ownerId =
          (l.ownerLegacyId ? resellerIdByLegacy.get(l.ownerLegacyId) : undefined) ??
          options.ownerId ??
          null;

        try {
          await prisma.line.create({
            data: {
              username: l.username,
              password: l.password,
              expiresAt: l.expiresAt,
              maxConnections: l.maxConnections ?? 1,
              status,
              ownerId,
              externalId: l.legacyId ?? null,
              notes: l.notes ?? null,
              allowedIps: l.allowedIps ?? null,
              lockToIp: l.lockToIp ?? false,
              canWatchAdult: l.canWatchAdult !== false,
              allowedCountries: l.allowedCountries ?? null,
              blockedCountries: l.blockedCountries ?? null,
              allowedOutput: l.allowedOutput ?? "ts,hls,m3u8",
              bouquets:
                bouquetIds.length > 0
                  ? { create: bouquetIds.map((bouquetId) => ({ bouquetId })) }
                  : undefined,
            },
          });
          result.lines.imported++;
        } catch (e) {
          result.lines.skipped++;
          result.warnings.push(`Line ${l.username}: ${String(e)}`);
        }
      }
    }

    if (options.importMag !== false && bundle.magDevices?.length) {
      for (let i = 0; i < bundle.magDevices.length; i++) {
        const m = bundle.magDevices[i];
        options.onProgress?.("mag", i + 1, bundle.magDevices.length);
        const line = await prisma.line.findUnique({
          where: { username: m.lineUsername },
        });
        if (!line) {
          result.magDevices.skipped++;
          result.warnings.push(`MAG ${m.mac}: line ${m.lineUsername} not found`);
          continue;
        }
        try {
          await prisma.magDevice.upsert({
            where: { mac: m.mac },
            create: {
              mac: m.mac,
              lineId: line.id,
              model: m.model ?? null,
            },
            update: { lineId: line.id, model: m.model ?? null },
          });
          result.magDevices.imported++;
        } catch {
          result.magDevices.skipped++;
        }
      }
    }

    if (options.importEnigma !== false && bundle.enigmaDevices?.length) {
      for (let i = 0; i < bundle.enigmaDevices.length; i++) {
        const m = bundle.enigmaDevices[i];
        options.onProgress?.("enigma", i + 1, bundle.enigmaDevices.length);
        const line = await prisma.line.findUnique({
          where: { username: m.lineUsername },
        });
        if (!line) {
          result.enigmaDevices.skipped++;
          result.warnings.push(`Enigma ${m.mac}: line ${m.lineUsername} not found`);
          continue;
        }
        try {
          await prisma.enigmaDevice.upsert({
            where: { mac: m.mac },
            create: {
              mac: m.mac,
              lineId: line.id,
              model: m.model ?? null,
            },
            update: { lineId: line.id, model: m.model ?? null },
          });
          result.enigmaDevices.imported++;
        } catch {
          result.enigmaDevices.skipped++;
        }
      }
    }

    return result;
  };

  // If a transaction client was passed, use it directly; otherwise wrap in a transaction
  if (options.tx) {
    return run(options.tx);
  }
  return globalPrisma.$transaction(run, {
    maxWait: 30000,
    timeout: 600000, // 10 minutes for large imports
  });
}
