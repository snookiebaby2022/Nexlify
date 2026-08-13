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
  MigrationSource,
} from "./types";
import { settingsKeyForSource } from "./phase3";

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
    source?: string;
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
  const settingsKey = settingsKeyForSource(
    (opts.source as MigrationSource | undefined) ??
      (phase3.settingsRaw?._migrationSource as MigrationSource | undefined)
  );

  // Older bundles / JSON may omit newer fields.
  phase3.accessCodes ??= [];
  phase3.blockedUserAgents ??= [];
  phase3.userGroups ??= [];
  phase3.liveConnections ??= [];
  phase3.onDemandStreamLegacyIds ??= [];
  phase3.watchCategories ??= [];
  phase3.watchRefresh ??= [];
  phase3.epgApiChannels ??= [];
  phase3.epgLanguages ??= [];
  phase3.crontab ??= [];
  phase3.profiles ??= [];
  phase3.creditLogs ??= [];
  phase3.streamOptions ??= [];
  phase3.streamArguments ??= [];
  phase3.streamErrors ??= [];
  phase3.extraTableBlobs ??= {};
  result.accessCodes ??= { imported: 0, skipped: 0 };
  result.blockedUserAgents ??= { imported: 0, skipped: 0 };
  result.userGroups ??= { imported: 0, skipped: 0 };
  result.liveConnections ??= { imported: 0, skipped: 0 };
  result.onDemandStreams ??= { imported: 0, skipped: 0 };
  result.extrasBlobs ??= { imported: 0, skipped: 0 };

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

  // --- full EPG guide (default on; uncheck for source URLs only) ---
  if (options.importEpgGuide !== false && (phase3.epgPrograms.length || phase3.epgChannels.length)) {
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
          config: { importedFrom: "panel_epg_data" },
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
        where: { key: settingsKey },
        create: {
          key: settingsKey,
          value: JSON.stringify(phase3.settingsRaw),
        },
        update: { value: JSON.stringify(phase3.settingsRaw) },
      });
      result.settings.imported++;
      pushWarning(
        result.warnings,
        `Stored panel settings as PanelSetting key ${settingsKey} (review manually — do not apply blindly).`
      );
    } catch (e) {
      result.settings.skipped++;
      pushWarning(result.warnings, `Settings: ${shortErr(e)}`);
    }
  }

  // --- extras (access codes, UAs, groups, live sessions, on-demand, epg_api, crontab, profiles, …) ---
  if (options.importExtras !== false) {
    const extrasPrefix = settingsKey.replace(/_settings$/, "");

    // Access codes
    for (let i = 0; i < phase3.accessCodes.length; i++) {
      const a = phase3.accessCodes[i];
      onProgress?.("accessCodes", i + 1, phase3.accessCodes.length);
      try {
        const existing = await prisma.accessCode.findUnique({ where: { code: a.code } });
        if (existing) {
          result.accessCodes.skipped++;
          continue;
        }
        await prisma.accessCode.create({
          data: {
            code: a.code,
            days: Math.max(1, a.days ?? 30),
            maxConnections: Math.max(1, a.maxConnections ?? 1),
            maxUses: Math.max(0, a.maxUses ?? 1),
            uses: Math.max(0, a.uses ?? 0),
            expiresAt: a.expiresAt ?? null,
            isActive: a.isActive !== false,
            notes: a.notes ?? null,
            bouquetIds: a.bouquetLegacyIds ?? [],
          },
        });
        result.accessCodes.imported++;
      } catch (e) {
        result.accessCodes.skipped++;
        pushWarning(result.warnings, `Access code ${a.code}: ${shortErr(e)}`);
      }
    }

    // Blocked user agents
    for (let i = 0; i < phase3.blockedUserAgents.length; i++) {
      const u = phase3.blockedUserAgents[i];
      onProgress?.("blockedUserAgents", i + 1, phase3.blockedUserAgents.length);
      try {
        const dup = await prisma.blockedUserAgent.findFirst({
          where: { pattern: u.pattern },
        });
        if (dup) {
          result.blockedUserAgents.skipped++;
          continue;
        }
        await prisma.blockedUserAgent.create({
          data: {
            pattern: u.pattern,
            reason: u.reason ?? null,
            isActive: u.isActive !== false,
          },
        });
        result.blockedUserAgents.imported++;
      } catch (e) {
        result.blockedUserAgents.skipped++;
        pushWarning(result.warnings, `Blocked UA: ${shortErr(e)}`);
      }
    }

    // User groups
    const groupIdByLegacy = new Map<string, string>();
    for (let i = 0; i < phase3.userGroups.length; i++) {
      const g = phase3.userGroups[i];
      onProgress?.("userGroups", i + 1, phase3.userGroups.length);
      try {
        const dup = await prisma.userGroup.findFirst({ where: { name: g.name } });
        if (dup) {
          groupIdByLegacy.set(g.legacyId, dup.id);
          result.userGroups.skipped++;
          continue;
        }
        const created = await prisma.userGroup.create({
          data: {
            name: g.name,
            description: g.description ?? null,
            isReseller: g.isReseller === true,
            isBanned: g.isBanned === true,
            sortOrder: g.sortOrder ?? 0,
            config: (g.config ?? {}) as Prisma.InputJsonValue,
          },
        });
        groupIdByLegacy.set(g.legacyId, created.id);
        result.userGroups.imported++;
      } catch (e) {
        result.userGroups.skipped++;
        pushWarning(result.warnings, `User group ${g.name}: ${shortErr(e)}`);
      }
    }

    // Live sessions (historical snapshot — capped)
    for (let i = 0; i < phase3.liveConnections.length; i++) {
      const c = phase3.liveConnections[i];
      onProgress?.("liveConnections", i + 1, phase3.liveConnections.length);
      try {
        let lineId =
          (c.lineLegacyId && lineIdByLegacy.get(c.lineLegacyId)) || null;
        if (!lineId && c.lineUsername) {
          const line = await prisma.line.findFirst({
            where: { username: c.lineUsername },
            select: { id: true },
          });
          lineId = line?.id ?? null;
        }
        if (!lineId) {
          result.liveConnections.skipped++;
          continue;
        }
        const streamId =
          (c.streamLegacyId && streamIdByLegacy.get(c.streamLegacyId)) || null;
        await prisma.liveConnection.create({
          data: {
            lineId,
            streamId,
            ip: c.ip ?? null,
            userAgent: c.userAgent ?? null,
            startedAt: c.startedAt ?? undefined,
            lastSeenAt: c.lastSeenAt ?? c.startedAt ?? undefined,
          },
        });
        result.liveConnections.imported++;
      } catch (e) {
        result.liveConnections.skipped++;
        pushWarning(result.warnings, `Live session: ${shortErr(e)}`);
      }
    }

    // On-demand flags on streams
    if (phase3.onDemandStreamLegacyIds.length) {
      let updated = 0;
      for (let i = 0; i < phase3.onDemandStreamLegacyIds.length; i++) {
        const legacyId = phase3.onDemandStreamLegacyIds[i];
        onProgress?.(
          "onDemandStreams",
          i + 1,
          phase3.onDemandStreamLegacyIds.length
        );
        const streamId = streamIdByLegacy.get(legacyId);
        if (!streamId) {
          result.onDemandStreams.skipped++;
          continue;
        }
        try {
          await prisma.stream.update({
            where: { id: streamId },
            data: { isOnDemand: true, vodMode: "ON_DEMAND" },
          });
          updated++;
          result.onDemandStreams.imported++;
        } catch {
          result.onDemandStreams.skipped++;
        }
      }
      if (updated) {
        pushWarning(
          result.warnings,
          `Marked ${updated} stream(s) as on-demand from ondemand_check.`
        );
      }
    }

    // epg_api → attach to EpgSource.config.apiChannels
    if (phase3.epgApiChannels.length) {
      const bySource = new Map<string, typeof phase3.epgApiChannels>();
      const fallbackId =
        [...epgSourceIdByLegacy.values()][0] ??
        (await prisma.epgSource.findFirst())?.id ??
        null;
      for (const ch of phase3.epgApiChannels) {
        const key =
          (ch.sourceLegacyId && epgSourceIdByLegacy.get(ch.sourceLegacyId)) ||
          fallbackId;
        if (!key) continue;
        const list = bySource.get(key) ?? [];
        list.push(ch);
        bySource.set(key, list);
      }
      for (const [sourceId, channels] of bySource) {
        try {
          const existing = await prisma.epgSource.findUnique({ where: { id: sourceId } });
          const prev =
            existing?.config && typeof existing.config === "object"
              ? (existing.config as Record<string, unknown>)
              : {};
          await prisma.epgSource.update({
            where: { id: sourceId },
            data: {
              config: {
                ...prev,
                apiChannels: channels.slice(0, 50_000).map((c) => ({
                  id: c.channelId,
                  name: c.name,
                  icon: c.icon,
                  language: c.language,
                })),
              },
            },
          });
          result.extrasBlobs.imported++;
        } catch (e) {
          result.extrasBlobs.skipped++;
          pushWarning(result.warnings, `epg_api attach: ${shortErr(e)}`);
        }
      }
    }

    // Store reference blobs: epg languages, crontab, profiles, watch categories/refresh
    async function storeBlob(suffix: string, value: unknown) {
      if (value == null) return;
      const key = `${extrasPrefix}_${suffix}`;
      try {
        await prisma.panelSetting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        });
        result.extrasBlobs.imported++;
      } catch (e) {
        result.extrasBlobs.skipped++;
        pushWarning(result.warnings, `${suffix} blob: ${shortErr(e)}`);
      }
    }

    if (phase3.epgLanguages.length) {
      await storeBlob("epg_languages", phase3.epgLanguages);
    }
    if (phase3.crontab.length) {
      await storeBlob("crontab", phase3.crontab);
      pushWarning(
        result.warnings,
        `Stored ${phase3.crontab.length} crontab row(s) under PanelSetting (Nexlify uses its own cron — review manually).`
      );
    }
    if (phase3.profiles.length) {
      await storeBlob("profiles", phase3.profiles);
      pushWarning(
        result.warnings,
        `Stored ${phase3.profiles.length} transcoder profile(s) under PanelSetting (rebuild in Nexlify if needed).`
      );
    }
    if (phase3.watchCategories.length) {
      await storeBlob("watch_categories", phase3.watchCategories);
    }
    if (phase3.watchRefresh.length) {
      await storeBlob("watch_refresh", {
        rows: phase3.watchRefresh,
        note: "Sample of XUI watch_refresh queue; not replayed automatically.",
      });
    }

    // Stream errors → StreamIssue
    for (let i = 0; i < phase3.streamErrors.length; i++) {
      const err = phase3.streamErrors[i];
      onProgress?.("streamErrors", i + 1, phase3.streamErrors.length);
      const streamId = err.streamLegacyId
        ? streamIdByLegacy.get(err.streamLegacyId)
        : null;
      if (!streamId) {
        result.extrasBlobs.skipped++;
        continue;
      }
      try {
        await prisma.streamIssue.create({
          data: {
            streamId,
            issueType: "source_down",
            severity: "warning",
            detectedAt: err.createdAt ?? undefined,
            fixResult: err.message.slice(0, 2000),
          },
        });
        result.extrasBlobs.imported++;
      } catch {
        result.extrasBlobs.skipped++;
      }
    }

    // Stream options / arguments as review blobs
    if (phase3.streamOptions.length) {
      await storeBlob("streams_options", phase3.streamOptions.slice(0, 5000));
    }
    if (phase3.streamArguments.length) {
      await storeBlob("streams_arguments", phase3.streamArguments.slice(0, 5000));
    }

    // Extra table blobs (output_devices, formats, divergence, mysql_syslog, epg_api sample, …)
    for (const [key, value] of Object.entries(phase3.extraTableBlobs ?? {})) {
      await storeBlob(key, value);
    }

    // Credit logs
    for (let i = 0; i < phase3.creditLogs.length; i++) {
      const log = phase3.creditLogs[i];
      onProgress?.("creditLogs", i + 1, phase3.creditLogs.length);
      const userId = resellerIdByLegacy.get(log.userLegacyId);
      if (!userId) {
        result.extrasBlobs.skipped++;
        continue;
      }
      try {
        const user = await prisma.panelUser.findUnique({
          where: { id: userId },
          select: { credits: true },
        });
        await prisma.creditTransaction.create({
          data: {
            userId,
            amount: log.amount,
            balanceAfter: user?.credits ?? 0,
            note: log.note ?? "Imported credit log",
            createdAt: log.createdAt ?? undefined,
          },
        });
        result.extrasBlobs.imported++;
      } catch {
        result.extrasBlobs.skipped++;
      }
    }
  }
}
