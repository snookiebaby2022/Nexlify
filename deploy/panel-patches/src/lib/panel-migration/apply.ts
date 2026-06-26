import { LineStatus, PanelRole, StreamType } from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import type {
  MigrationApplyOptions,
  MigrationApplyResult,
  MigrationBundle,
} from "./types";

export async function applyMigrationBundle(
  bundle: MigrationBundle,
  options: MigrationApplyOptions
): Promise<MigrationApplyResult> {
  const result: MigrationApplyResult = {
    bouquets: { imported: 0, skipped: 0 },
    streams: { imported: 0, skipped: 0 },
    lines: { imported: 0, skipped: 0 },
    resellers: { imported: 0, skipped: 0 },
    magDevices: { imported: 0, skipped: 0 },
    warnings: [],
  };

  const bouquetIdByLegacy = new Map<string, string>();
  const streamIdByLegacy = new Map<string, string>();

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
      const created = await prisma.stream.create({
        data: {
          name: s.name,
          streamUrl: s.streamUrl,
          streamIcon: s.streamIcon ?? null,
          type,
          serverId: options.defaultServerId ?? null,
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

  if (options.importResellers) {
    for (const r of bundle.resellers ?? []) {
      const exists = await prisma.panelUser.findUnique({
        where: { username: r.username },
      });
      if (exists) {
        result.resellers.skipped++;
        continue;
      }
      await prisma.panelUser.create({
        data: {
          username: r.username,
          passwordHash: await hashPassword(r.password),
          role: PanelRole.RESELLER,
          credits: r.credits ?? 0,
          isActive: r.isActive !== false,
        },
      });
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

      try {
        await prisma.line.create({
          data: {
            username: l.username,
            password: l.password,
            expiresAt: l.expiresAt,
            maxConnections: l.maxConnections ?? 1,
            status,
            ownerId: options.ownerId ?? null,
            externalId: l.legacyId ?? null,
            notes: l.notes ?? null,
            allowedIps: l.allowedIps ?? null,
            lockToIp: l.lockToIp ?? false,
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

  if (options.importMag && bundle.magDevices?.length) {
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

  return result;
}
