import {
  LineAuthMode,
  LineStatus,
  PanelRole,
  StreamType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { generateLinePassword } from "@/lib/credential-generate";
import { resolveProviderUrl } from "@/lib/vod-provider-url";
import type { PanelTransferBundle } from "./panel-transfer-export";

export type PanelTransferImportOptions = {
  importBouquets?: boolean;
  importStreams?: boolean;
  importLines?: boolean;
  importResellers?: boolean;
  importProviders?: boolean;
  skipExistingLines?: boolean;
  skipExistingStreams?: boolean;
  skipExistingResellers?: boolean;
  defaultServerId?: string | null;
  dryRun?: boolean;
};

export type PanelTransferImportResult = {
  bouquets: { imported: number; skipped: number };
  streams: { imported: number; skipped: number; updated: number };
  lines: { imported: number; skipped: number };
  resellers: { imported: number; skipped: number };
  providers: { imported: number; skipped: number };
  warnings: string[];
  generatedPasswords: { username: string; password: string }[];
};

function asBundle(raw: unknown): PanelTransferBundle {
  const o = raw as Record<string, unknown>;
  return {
    version: 1,
    source: "nexlify_json",
    exportedAt: String(o.exportedAt ?? new Date().toISOString()),
    bouquets: Array.isArray(o.bouquets) ? (o.bouquets as PanelTransferBundle["bouquets"]) : [],
    streams: Array.isArray(o.streams) ? (o.streams as PanelTransferBundle["streams"]) : [],
    lines: Array.isArray(o.lines) ? (o.lines as PanelTransferBundle["lines"]) : [],
    resellers: Array.isArray(o.resellers) ? (o.resellers as PanelTransferBundle["resellers"]) : [],
    providers: Array.isArray(o.providers) ? (o.providers as PanelTransferBundle["providers"]) : [],
  };
}

export function previewPanelTransfer(raw: unknown) {
  const b = asBundle(raw);
  return {
    counts: {
      bouquets: b.bouquets.length,
      streams: b.streams.length,
      lines: b.lines.length,
      resellers: b.resellers.length,
      providers: b.providers.length,
    },
    exportedAt: b.exportedAt,
  };
}

export async function importPanelTransfer(
  raw: unknown,
  options: PanelTransferImportOptions
): Promise<PanelTransferImportResult> {
  const bundle = asBundle(raw);
  const result: PanelTransferImportResult = {
    bouquets: { imported: 0, skipped: 0 },
    streams: { imported: 0, skipped: 0, updated: 0 },
    lines: { imported: 0, skipped: 0 },
    resellers: { imported: 0, skipped: 0 },
    providers: { imported: 0, skipped: 0 },
    warnings: [],
    generatedPasswords: [],
  };

  if (options.dryRun) return result;

  const bouquetIdByName = new Map<string, string>();
  const streamIdByName = new Map<string, string>();
  const providerIdByName = new Map<string, { id: string; baseUrl: string; apiKey: string | null; providerType: string | null }>();
  const categoryIdByName = new Map<string, string>();
  const ownerIdByUsername = new Map<string, string>();

  if (options.importProviders !== false && bundle.providers.length) {
    for (const p of bundle.providers) {
      const existing = await prisma.streamProvider.findFirst({ where: { name: p.name } });
      if (existing) {
        providerIdByName.set(p.name, {
          id: existing.id,
          baseUrl: existing.baseUrl,
          apiKey: existing.apiKey,
          providerType: existing.providerType,
        });
        result.providers.skipped++;
        continue;
      }
      const created = await prisma.streamProvider.create({
        data: {
          name: p.name,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey ?? null,
          providerType: p.providerType ?? null,
          description: p.description ?? null,
          region: p.region ?? null,
          isActive: p.isActive !== false,
        },
      });
      providerIdByName.set(p.name, {
        id: created.id,
        baseUrl: created.baseUrl,
        apiKey: created.apiKey,
        providerType: created.providerType,
      });
      result.providers.imported++;
    }
  } else {
    const existing = await prisma.streamProvider.findMany();
    for (const p of existing) {
      providerIdByName.set(p.name, {
        id: p.id,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        providerType: p.providerType,
      });
    }
  }

  if (options.importBouquets !== false) {
    for (const b of bundle.bouquets) {
      const existing = await prisma.bouquet.findFirst({ where: { name: b.name } });
      if (existing) {
        bouquetIdByName.set(b.legacyId, existing.id);
        bouquetIdByName.set(b.name, existing.id);
        result.bouquets.skipped++;
        continue;
      }
      const created = await prisma.bouquet.create({
        data: {
          name: b.name,
          sortOrder: b.sortOrder ?? 0,
          isActive: b.isActive !== false,
        },
      });
      bouquetIdByName.set(b.legacyId, created.id);
      bouquetIdByName.set(b.name, created.id);
      result.bouquets.imported++;
    }
  } else {
    const existing = await prisma.bouquet.findMany();
    for (const b of existing) {
      bouquetIdByName.set(b.name, b.id);
    }
  }

  if (options.importStreams !== false) {
    for (const s of bundle.streams) {
      const dup = await prisma.stream.findFirst({ where: { name: s.name } });
      if (dup && options.skipExistingStreams !== false) {
        streamIdByName.set(s.legacyId, dup.id);
        streamIdByName.set(s.name, dup.id);
        result.streams.skipped++;
        continue;
      }

      let categoryId: string | null = null;
      if (s.categoryName) {
        let cat = categoryIdByName.get(s.categoryName);
        if (!cat) {
          const found = await prisma.category.findFirst({ where: { name: s.categoryName } });
          if (found) cat = found.id;
          else {
            const created = await prisma.category.create({ data: { name: s.categoryName } });
            cat = created.id;
          }
          categoryIdByName.set(s.categoryName, cat);
        }
        categoryId = cat;
      }

      let providerId: string | null = null;
      const providerPath: string | null = s.providerPath ?? null;
      let streamUrl = s.streamUrl;
      const hostedExternally = Boolean(s.hostedExternally && s.providerName);

      if (s.providerName) {
        const prov = providerIdByName.get(s.providerName);
        if (prov) {
          providerId = prov.id;
          if (providerPath) {
            try {
              streamUrl = resolveProviderUrl(prov, providerPath);
            } catch {
              result.warnings.push(`Stream ${s.name}: could not resolve provider URL`);
            }
          }
        } else {
          result.warnings.push(`Stream ${s.name}: provider "${s.providerName}" not found`);
        }
      }

      const type =
        s.type === "MOVIE"
          ? StreamType.MOVIE
          : s.type === "SERIES"
            ? StreamType.SERIES
            : StreamType.LIVE;

      const data: Prisma.StreamCreateInput = {
        name: s.name,
        streamUrl,
        streamIcon: s.streamIcon ?? null,
        type,
        isActive: s.isActive !== false,
        epgChannelId: s.epgChannelId ?? null,
        channelId: s.channelId ?? null,
        providerPath,
        hostedExternally,
        server: options.defaultServerId
          ? { connect: { id: options.defaultServerId } }
          : undefined,
        category: categoryId ? { connect: { id: categoryId } } : undefined,
        provider: providerId ? { connect: { id: providerId } } : undefined,
      };

      if (dup && options.skipExistingStreams === false) {
        await prisma.stream.update({ where: { id: dup.id }, data: {
          streamUrl: data.streamUrl,
          streamIcon: data.streamIcon,
          isActive: data.isActive,
          providerPath,
          hostedExternally,
          providerId,
          categoryId,
        }});
        streamIdByName.set(s.legacyId, dup.id);
        streamIdByName.set(s.name, dup.id);
        result.streams.updated++;
        continue;
      }

      const created = await prisma.stream.create({ data });
      streamIdByName.set(s.legacyId, created.id);
      streamIdByName.set(s.name, created.id);
      result.streams.imported++;
    }

    for (const b of bundle.bouquets) {
      const bouquetId = bouquetIdByName.get(b.legacyId) ?? bouquetIdByName.get(b.name);
      if (!bouquetId) continue;
      for (const sid of b.streamLegacyIds) {
        const streamId = streamIdByName.get(sid);
        if (!streamId) continue;
        await prisma.bouquetStream.upsert({
          where: { bouquetId_streamId: { bouquetId, streamId } },
          create: { bouquetId, streamId },
          update: {},
        });
      }
    }
  }

  const admins = await prisma.panelUser.findMany({
    where: { role: PanelRole.ADMIN },
    select: { id: true, username: true },
  });
  for (const a of admins) ownerIdByUsername.set(a.username, a.id);

  if (options.importResellers) {
    const pendingParents: { username: string; parentUsername?: string }[] = [];

    for (const r of bundle.resellers) {
      const exists = await prisma.panelUser.findUnique({ where: { username: r.username } });
      if (exists) {
        ownerIdByUsername.set(r.username, exists.id);
        result.resellers.skipped++;
        continue;
      }

      let password = r.password?.trim();
      if (!password) {
        password = generateLinePassword();
        result.generatedPasswords.push({ username: r.username, password });
      }

      const role =
        r.role === "SUB_RESELLER" ? PanelRole.SUB_RESELLER : PanelRole.RESELLER;

      const created = await prisma.panelUser.create({
        data: {
          username: r.username,
          passwordHash: await hashPassword(password),
          role,
          credits: r.credits ?? 0,
          maxLines: r.maxLines ?? 500,
          resellerDns: r.resellerDns ?? null,
          isActive: r.isActive !== false,
        },
      });
      ownerIdByUsername.set(r.username, created.id);
      pendingParents.push({ username: r.username, parentUsername: r.parentUsername });
      result.resellers.imported++;

      for (const bname of r.bouquetNames ?? []) {
        const bouquetId = bouquetIdByName.get(bname);
        if (!bouquetId) continue;
        await prisma.resellerBouquet.upsert({
          where: { userId_bouquetId: { userId: created.id, bouquetId } },
          create: { userId: created.id, bouquetId },
          update: {},
        });
      }
    }

    for (const p of pendingParents) {
      if (!p.parentUsername) continue;
      const childId = ownerIdByUsername.get(p.username);
      const parentId = ownerIdByUsername.get(p.parentUsername);
      if (!childId || !parentId) {
        result.warnings.push(`Reseller ${p.username}: parent "${p.parentUsername}" not found`);
        continue;
      }
      await prisma.panelUser.update({
        where: { id: childId },
        data: { parentId },
      });
    }
  } else {
    const users = await prisma.panelUser.findMany({ select: { id: true, username: true } });
    for (const u of users) ownerIdByUsername.set(u.username, u.id);
  }

  if (options.importLines !== false) {
    for (const l of bundle.lines) {
      if (options.skipExistingLines !== false) {
        const exists = await prisma.line.findUnique({ where: { username: l.username } });
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
        .map((id) => bouquetIdByName.get(id))
        .filter(Boolean) as string[];

      const ownerId = l.ownerUsername
        ? ownerIdByUsername.get(l.ownerUsername) ?? null
        : null;

      try {
        await prisma.line.create({
          data: {
            username: l.username,
            password: l.password,
            expiresAt: new Date(l.expiresAt),
            maxConnections: l.maxConnections ?? 1,
            status,
            ownerId,
            externalId: l.legacyId ?? null,
            notes: l.notes ?? null,
            allowedIps: l.allowedIps ?? null,
            lockToIp: l.lockToIp ?? false,
            authMode:
              l.authMode === "ACTIVE_CODE"
                ? LineAuthMode.ACTIVE_CODE
                : LineAuthMode.USERNAME_PASSWORD,
            activeCode: l.activeCode ?? null,
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

  return result;
}
