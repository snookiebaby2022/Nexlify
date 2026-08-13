/**
 * Apply MigrationPhase3Data (providers, watch, tickets, EPG guide, ASNs, logs, stats, settings).
 */

import {
  ImportKind,
  PanelRole,
  Prisma,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  WatchFolderType,
} from "@prisma/client";
import { prisma } from "../prisma";
import { hashPassword } from "../auth";
import type {
  MigrationApplyOptions,
  MigrationApplyResult,
  MigrationPhase3Data,
} from "./types";

function shortErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").slice(0, 220);
}

function pushWarning(warnings: string[], msg: string) {
  if (warnings.length >= 80) return;
  warnings.push(msg);
}

async function ensureImportBotUser(): Promise<string> {
  const existing = await prisma.panelUser.findFirst({
    where: { username: "xui-import-bot" },
  });
  if (existing) return existing.id;
  const admin = await prisma.panelUser.findFirst({
    where: { role: PanelRole.ADMIN },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return admin.id;
  const created = await prisma.panelUser.create({
    data: {
      username: "xui-import-bot",
      passwordHash: await hashPassword(`xui-import-${Date.now()}`),
      role: PanelRole.ADMIN,
      credits: 0,
      isActive: true,
      notes: "Auto-created for XUI ticket/log migration",
    },
  });
  return created.id;
}

export async function applyMigrationPhase3(
  phase3: MigrationPhase3Data,
  opts: {
    options: MigrationApplyOptions;
    result: MigrationApplyResult;
    streamIdByLegacy: Map<string, string>;
    categoryIdByLegacy: Map<string, string>;
    serverIdByLegacy: Map<string, string>;
    epgSourceIdByLegacy: Map<string, string>;
    resellerIdByLegacy: Map<string, string>;
    lineIdByLegacy: Map<string, string>;
  }
) {
  const {
    options,
    result,
    streamIdByLegacy,
    categoryIdByLegacy,
    serverIdByLegacy,
    epgSourceIdByLegacy,
    resellerIdByLegacy,
    lineIdByLegacy,
  } = opts;
  const onProgress = options.onProgress;

  // --- providers ---
  const providerIdByLegacy = new Map<string, string>();
  if (options.importProviders !== false && phase3.providers.length) {
    onProgress?.("providers", 0, phase3.providers.length);
    for (let i = 0; i < phase3.providers.length; i++) {
      const p = phase3.providers[i];
      onProgress?.("providers", i + 1, phase3.providers.length);
      try {
        const dup = await prisma.streamProvider.findFirst({
          where: { OR: [{ name: p.name }, { baseUrl: p.baseUrl }] },
        });
        if (dup) {
          providerIdByLegacy.set(p.legacyId, dup.id);
          result.providers.skipped++;
          continue;
        }
        const created = await prisma.streamProvider.create({
          data: {
            name: p.name,
            baseUrl: p.baseUrl,
            apiKey: p.apiKey ?? null,
            providerType: p.providerType ?? null,
            notes: p.notes ?? null,
            isActive: p.isActive !== false,
            status: "unknown",
          },
        });
        providerIdByLegacy.set(p.legacyId, created.id);
        result.providers.imported++;
      } catch (e) {
        result.providers.skipped++;
        pushWarning(result.warnings, `Provider ${p.name}: ${shortErr(e)}`);
      }
    }
    // Link streams
    let linked = 0;
    for (const link of phase3.providerStreamLinks) {
      const providerId = providerIdByLegacy.get(link.providerLegacyId);
      const streamId = streamIdByLegacy.get(link.streamLegacyId);
      if (!providerId || !streamId) continue;
      try {
        await prisma.stream.update({
          where: { id: streamId },
          data: {
            providerId,
            providerPath: link.providerPath ?? null,
            hostedExternally: true,
          },
        });
        linked++;
      } catch {
        /* skip */
      }
    }
    if (linked) {
      pushWarning(result.warnings, `Linked ${linked} streams to imported providers.`);
    }
  }

  // --- watch folders ---
  const watchFolderIdByLegacy = new Map<string, string>();
  if (options.importWatchFolders !== false && phase3.watchFolders.length) {
    for (let i = 0; i < phase3.watchFolders.length; i++) {
      const f = phase3.watchFolders[i];
      onProgress?.("watchFolders", i + 1, phase3.watchFolders.length);
      try {
        const dup = await prisma.watchFolder.findFirst({
          where: { OR: [{ path: f.path }, { name: f.name }] },
        });
        if (dup) {
          watchFolderIdByLegacy.set(f.legacyId, dup.id);
          result.watchFolders.skipped++;
          continue;
        }
        const type =
          f.type === "MOVIE"
            ? WatchFolderType.MOVIE
            : f.type === "SERIES"
              ? WatchFolderType.SERIES
              : f.type === "M3U"
                ? WatchFolderType.M3U
                : WatchFolderType.MIXED;
        const created = await prisma.watchFolder.create({
          data: {
            name: f.name,
            path: f.path,
            type,
            categoryId: f.categoryLegacyId
              ? categoryIdByLegacy.get(f.categoryLegacyId) ?? null
              : null,
            serverId: f.serverLegacyId
              ? serverIdByLegacy.get(f.serverLegacyId) ?? null
              : null,
            isActive: f.isActive !== false,
            isAdult: f.isAdult === true,
            autoScanMins: f.autoScanMins ?? 0,
            lastScan: f.lastScan ?? null,
            importedCount: f.importedCount ?? 0,
          },
        });
        watchFolderIdByLegacy.set(f.legacyId, created.id);
        result.watchFolders.imported++;
      } catch (e) {
        result.watchFolders.skipped++;
        pushWarning(result.warnings, `Watch folder ${f.name}: ${shortErr(e)}`);
      }
    }
    for (const log of phase3.watchLogs) {
      try {
        await prisma.importJob.create({
          data: {
            kind: ImportKind.WATCH_SCAN,
            source: log.source,
            status: log.status ?? "done",
            imported: log.imported ?? 0,
            skipped: log.skipped ?? 0,
            message: log.message ?? null,
            watchFolderId: log.watchFolderLegacyId
              ? watchFolderIdByLegacy.get(log.watchFolderLegacyId) ?? null
              : null,
            createdAt: log.createdAt ?? undefined,
            completedAt: log.createdAt ?? undefined,
          },
        });
      } catch {
        /* skip */
      }
    }
  }

  // --- tickets ---
  if (options.importTickets !== false && phase3.tickets.length) {
    const botId = await ensureImportBotUser();
    for (let i = 0; i < phase3.tickets.length; i++) {
      const t = phase3.tickets[i];
      onProgress?.("tickets", i + 1, phase3.tickets.length);
      try {
        const createdById =
          (t.createdByLegacyId && resellerIdByLegacy.get(t.createdByLegacyId)) ||
          botId;
        const created = await prisma.ticket.create({
          data: {
            subject: t.subject.slice(0, 200),
            body: t.body,
            status:
              t.status === "CLOSED"
                ? TicketStatus.CLOSED
                : t.status === "RESOLVED"
                  ? TicketStatus.RESOLVED
                  : t.status === "IN_PROGRESS"
                    ? TicketStatus.IN_PROGRESS
                    : TicketStatus.OPEN,
            priority: TicketPriority.NORMAL,
            category: TicketCategory.SUPPORT,
            createdById,
            assignedToId:
              t.assignedToLegacyId
                ? resellerIdByLegacy.get(t.assignedToLegacyId) ?? null
                : null,
            lineId: t.lineLegacyId
              ? lineIdByLegacy.get(t.lineLegacyId) ?? null
              : null,
            createdAt: t.createdAt ?? undefined,
          },
        });
        for (const reply of t.replies ?? []) {
          try {
            await prisma.ticketMessage.create({
              data: {
                ticketId: created.id,
                authorId:
                  (reply.authorLegacyId &&
                    resellerIdByLegacy.get(reply.authorLegacyId)) ||
                  createdById,
                body: reply.body,
                createdAt: reply.createdAt ?? undefined,
              },
            });
          } catch {
            /* skip reply */
          }
        }
        result.tickets.imported++;
      } catch (e) {
        result.tickets.skipped++;
        pushWarning(result.warnings, `Ticket ${t.subject}: ${shortErr(e)}`);
      }
    }
  }

  // --- full EPG guide (opt-in — epg_data can be huge; EPG source URLs use importEpg) ---
  if (options.importEpgGuide === true && (phase3.epgPrograms.length || phase3.epgChannels.length)) {
    let defaultSourceId =
      [...epgSourceIdByLegacy.values()][0] ??
      (await prisma.epgSource.findFirst())?.id ??
      null;
    if (!defaultSourceId && phase3.epgPrograms.length) {
      const created = await prisma.epgSource.create({
        data: {
          name: "XUI EPG Import",
          url: "xui://imported-epg-data",
          sourceType: "xmltv",
          config: { importedFrom: "xui_epg_data" },
        },
      });
      defaultSourceId = created.id;
    }

    // Attach channel catalog onto each source config
    if (phase3.epgChannels.length && defaultSourceId) {
      const bySource = new Map<string, typeof phase3.epgChannels>();
      for (const ch of phase3.epgChannels) {
        const key = ch.sourceLegacyId
          ? epgSourceIdByLegacy.get(ch.sourceLegacyId) ?? defaultSourceId
          : defaultSourceId;
        if (!key) continue;
        const list = bySource.get(key) ?? [];
        list.push(ch);
        bySource.set(key, list);
      }
      for (const [sourceId, channels] of bySource) {
        try {
          await prisma.epgSource.update({
            where: { id: sourceId },
            data: {
              config: {
                xuiChannels: channels.slice(0, 50_000).map((c) => ({
                  id: c.channelId,
                  name: c.name,
                  icon: c.icon,
                })),
              },
            },
          });
        } catch {
          /* skip */
        }
      }
    }

    const batch: {
      sourceId: string;
      channelId: string;
      title: string;
      description: string | null;
      start: Date;
      stop: Date;
    }[] = [];
    for (const p of phase3.epgPrograms) {
      const sourceId =
        (p.sourceLegacyId && epgSourceIdByLegacy.get(p.sourceLegacyId)) ||
        defaultSourceId;
      if (!sourceId) continue;
      batch.push({
        sourceId,
        channelId: p.channelId,
        title: p.title.slice(0, 500),
        description: p.description?.slice(0, 4000) ?? null,
        start: p.start,
        stop: p.stop,
      });
    }
    const CHUNK = 500;
    for (let i = 0; i < batch.length; i += CHUNK) {
      onProgress?.("epgPrograms", Math.min(i + CHUNK, batch.length), batch.length);
      const slice = batch.slice(i, i + CHUNK);
      try {
        const res = await prisma.epgProgram.createMany({
          data: slice,
          skipDuplicates: true,
        });
        result.epgPrograms.imported += res.count;
        result.epgPrograms.skipped += slice.length - res.count;
      } catch (e) {
        result.epgPrograms.skipped += slice.length;
        pushWarning(result.warnings, `EPG programmes batch: ${shortErr(e)}`);
      }
    }
  }

  // --- blocked ASNs ---
  if (options.importBlockedAsns !== false && phase3.blockedAsns.length) {
    const CHUNK = 1000;
    for (let i = 0; i < phase3.blockedAsns.length; i += CHUNK) {
      onProgress?.(
        "blockedAsns",
        Math.min(i + CHUNK, phase3.blockedAsns.length),
        phase3.blockedAsns.length
      );
      const slice = phase3.blockedAsns.slice(i, i + CHUNK).map((a) => ({
        asn: a.asn.slice(0, 32),
        label: a.label?.slice(0, 200) ?? null,
        reason: a.reason?.slice(0, 500) ?? null,
        isActive: a.isActive !== false,
      }));
      try {
        const res = await prisma.blockedAsn.createMany({
          data: slice,
          skipDuplicates: true,
        });
        result.blockedAsns.imported += res.count;
        result.blockedAsns.skipped += slice.length - res.count;
      } catch (e) {
        result.blockedAsns.skipped += slice.length;
        pushWarning(result.warnings, `ASN batch: ${shortErr(e)}`);
      }
    }
  }

  // --- activity logs ---
  if (options.importLogs !== false && phase3.activityLogs.length) {
    const CHUNK = 500;
    for (let i = 0; i < phase3.activityLogs.length; i += CHUNK) {
      onProgress?.(
        "activityLogs",
        Math.min(i + CHUNK, phase3.activityLogs.length),
        phase3.activityLogs.length
      );
      const slice = phase3.activityLogs.slice(i, i + CHUNK).map((log) => ({
        action: log.action.slice(0, 100),
        entity: log.entity ?? null,
        entityId: log.entityId ?? null,
        meta: log.meta
          ? (log.meta as Prisma.InputJsonValue)
          : undefined,
        createdAt: log.createdAt ?? undefined,
      }));
      try {
        const res = await prisma.activityLog.createMany({ data: slice });
        result.activityLogs.imported += res.count;
        result.activityLogs.skipped += slice.length - res.count;
      } catch (e) {
        result.activityLogs.skipped += slice.length;
        pushWarning(result.warnings, `Activity log batch: ${shortErr(e)}`);
      }
    }
  }

  // --- bandwidth / stats ---
  if (options.importStats !== false && phase3.bandwidthSnapshots.length) {
    const CHUNK = 500;
    for (let i = 0; i < phase3.bandwidthSnapshots.length; i += CHUNK) {
      onProgress?.(
        "stats",
        Math.min(i + CHUNK, phase3.bandwidthSnapshots.length),
        phase3.bandwidthSnapshots.length
      );
      const slice = phase3.bandwidthSnapshots.slice(i, i + CHUNK).map((s) => ({
        bytesIn: BigInt(Math.max(0, Math.floor(s.bytesIn ?? 0))),
        bytesOut: BigInt(Math.max(0, Math.floor(s.bytesOut ?? 0))),
        connections: Math.max(0, Math.floor(s.connections ?? 0)),
        createdAt: s.createdAt ?? undefined,
      }));
      try {
        const res = await prisma.bandwidthSnapshot.createMany({ data: slice });
        result.bandwidthSnapshots.imported += res.count;
        result.bandwidthSnapshots.skipped += slice.length - res.count;
      } catch (e) {
        result.bandwidthSnapshots.skipped += slice.length;
        pushWarning(result.warnings, `Stats batch: ${shortErr(e)}`);
      }
    }
  }

  // --- settings blob ---
  if (options.importSettings !== false && phase3.settingsRaw) {
    try {
      await prisma.panelSetting.upsert({
        where: { key: "migration.xui_settings" },
        create: {
          key: "migration.xui_settings",
          value: JSON.stringify(phase3.settingsRaw),
        },
        update: { value: JSON.stringify(phase3.settingsRaw) },
      });
      result.settings.imported++;
      pushWarning(
        result.warnings,
        "Stored XUI settings as PanelSetting key migration.xui_settings (review manually — do not apply blindly)."
      );
    } catch (e) {
      result.settings.skipped++;
      pushWarning(result.warnings, `Settings: ${shortErr(e)}`);
    }
  }
}
