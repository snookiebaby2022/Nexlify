import { LineStatus, PanelRole, StreamType } from "@prisma/client";
import { prisma } from "../prisma";
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
  const result = emptyResult();

  let categoryIdByLegacy = new Map<string, string>();

  if (bundle.phase2) {
    const phase2Out = await applyMigrationPhase2(bundle.phase2, {
      importCategories: options.importCategories !== false,
      importServers: options.importServers !== false,
      importEpg: options.importEpg !== false,
      skipExisting: options.skipExistingStreams !== false,
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
    for (const b of bundle.bouquets) {
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
    for (const s of bundle.streams) {
      if (options.skipExistingStreams) {
        const dup = await prisma.stream.findFirst({ where: { name: s.name } });
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

      const created = await prisma.stream.create({
        data: {
          name: s.name,
          streamUrl: s.streamUrl,
          streamIcon: s.streamIcon ?? null,
          type,
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
      for (const sid of b.streamLegacyIds) {
        const streamId = streamIdByLegacy.get(String(sid));
        if (!streamId) continue;
        await prisma.bouquetStream.upsert({
          where: { bouquetId_streamId: { bouquetId, streamId } },
          create: { bouquetId, streamId },
          update: {},
        });
      }
    }
  }

  if (options.importResellers !== false) {
    for (const r of bundle.resellers ?? []) {
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
    for (const l of bundle.lines) {
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
    for (const m of bundle.magDevices) {
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
    for (const m of bundle.enigmaDevices) {
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
}
