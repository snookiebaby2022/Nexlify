import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  importPlexLibrary,
  importYoutubeSource,
  listPlexLibraries,
  testPlexConnection,
  testYoutubeConnection,
} from "@/lib/media-integrations";
import {
  importEmbyLibrary,
  importJellyfinLibrary,
  testEmbyStyleConnection,
} from "@/lib/emby-jellyfin-import";
import { importMusicAddon } from "@/lib/music-import";
import { testAppleMusicConnection, testSpotifyConnection } from "@/lib/music-relay";
import { attachPluginBouquetToAllLines } from "@/lib/integration-bouquet";
import { musicAddonById } from "@/lib/music-addons-catalog";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";
import { parseJsonBody, apiMutationErrorResponse } from "@/lib/parse-json-body";
import { normalizePlexConfig } from "@/lib/plex-config";
import {
  createSyncReporter,
  isSyncJobActive,
  resolveSyncProgress,
  type IntegrationSyncReporter,
} from "@/lib/integration-sync-progress";
import { enqueuePlexSync } from "@/lib/plex-sync-queue";
import { guardAdminApiRequest } from "@/lib/admin-route-guard";
import { resolvePlaybackLoadBalancerId } from "@/lib/server-load";

export const maxDuration = 300;

const MUSIC_TYPES = new Set(["spotify", "apple_music", "deezer", "youtube_music"]);

function keepSecret(next: unknown, prev: unknown): unknown {
  if (typeof next === "string" && next.trim()) return next;
  return prev;
}

function plexConfigFromBody(body: Record<string, unknown>, prev?: Record<string, unknown>) {
  return normalizePlexConfig({
    ...(prev ?? {}),
    ...body,
    token: keepSecret(body.token, prev?.token),
    password: keepSecret(body.password, prev?.password),
  });
}

async function plexConfigForSave(body: Record<string, unknown>, prev?: Record<string, unknown>) {
  const cfg = plexConfigFromBody(body, prev);
  cfg.serverId = await resolvePlaybackLoadBalancerId(cfg.serverId);
  return cfg;
}

async function runIntegrationSync(
  type: string,
  id: string,
  serverId: string | null,
  reporter: IntegrationSyncReporter
) {
  try {
    let result: Record<string, unknown>;
    if (type === "plex") {
      result = await importPlexLibrary(id, serverId, reporter);
    } else if (type === "emby") {
      result = await importEmbyLibrary(id, serverId, reporter);
    } else if (type === "jellyfin") {
      result = await importJellyfinLibrary(id, serverId, reporter);
    } else if (type in { spotify: 1, apple_music: 1, deezer: 1, youtube_music: 1 }) {
      result = await importMusicAddon(id, serverId, reporter);
    } else {
      result = await importYoutubeSource(id, serverId, reporter);
    }
    await attachPluginBouquetToAllLines();
    if (reporter.snapshot().status === "running") {
      await reporter.done(`Synced ${Number(result.imported ?? 0)} stream(s).`, result);
    }
  } catch (e) {
    await reporter.fail(e instanceof Error ? e.message : "Sync failed");
  }
}

export async function GET(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const type = req.nextUrl.searchParams.get("type");
  const items = await prisma.mediaIntegration.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
  });
  const mapped = await Promise.all(
    items.map(async (item) => ({
      ...item,
      syncProgress: await resolveSyncProgress(item.config, item.id),
    }))
  );
  const plexCron =
    !type || type === "plex" ? await (await import("@/lib/plex-catalog-match")).plexCronAdminStatus() : undefined;
  return NextResponse.json({ items: mapped, ...(plexCron ? { plexCron } : {}) });
}

export async function POST(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();

    const pluginType = String(
      body.type ??
        (body.action === "sync" || body.action === "libraries" || body.action === "test" || body.action === "sync-status"
          ? (await prisma.mediaIntegration.findUnique({ where: { id: String(body.id ?? "") } }))?.type ?? "plex"
          : "plex")
    );
    if (body.action !== "test" && body.action !== "sync-status") {
      const denied = await pluginEntitlementResponse(pluginType, host);
      if (denied) return denied;
    }

    if (body.action === "sync-status") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const row = await prisma.mediaIntegration.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ progress: await resolveSyncProgress(row.config, row.id) });
    }

    if (body.action === "test") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const row = await prisma.mediaIntegration.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (row.type === "plex") {
        const result = await testPlexConnection(id);
        return NextResponse.json(result);
      }
      if (row.type === "emby" || row.type === "jellyfin") {
        const result = await testEmbyStyleConnection(id, row.type);
        return NextResponse.json(result);
      }
      if (row.type === "youtube") {
        const result = await testYoutubeConnection(id);
        return NextResponse.json(result);
      }
      const cfg = row.config as Record<string, unknown>;
      const addon = musicAddonById(row.type);
      if (!addon) {
        return NextResponse.json({ message: "Integration saved (no automated test for this type)." });
      }
      const required = addon.fields.filter((f) => !f.key.includes("optional") && !f.label.toLowerCase().includes("optional"));
      const missing = required.filter((f) => !String(cfg[f.key] ?? "").trim());
      if (missing.length) {
        return NextResponse.json(
          { error: `Missing: ${missing.map((m) => m.label).join(", ")}` },
          { status: 400 }
        );
      }
      try {
        if (row.type === "spotify") {
          return NextResponse.json({ message: await testSpotifyConnection(cfg) });
        }
        if (row.type === "apple_music") {
          return NextResponse.json({ message: await testAppleMusicConnection(cfg) });
        }
        if (row.type === "deezer") {
          const playlistId = String(cfg.playlistId ?? "").trim();
          if (!playlistId) throw new Error("Deezer playlist ID required");
          const res = await fetch(`https://api.deezer.com/playlist/${encodeURIComponent(playlistId)}`, {
            signal: AbortSignal.timeout(12_000),
          });
          if (!res.ok) throw new Error(`Deezer API HTTP ${res.status}`);
          const data = (await res.json()) as { title?: string; error?: { message?: string } };
          if (data.error?.message) throw new Error(data.error.message);
          return NextResponse.json({ message: `Deezer playlist OK${data.title ? `: ${data.title}` : ""}.` });
        }
        if (row.type === "youtube_music") {
          const relay = String(cfg.relayUrl ?? "").trim();
          const apiKey = String(cfg.apiKey ?? "").trim();
          const channelId = String(cfg.channelId ?? "").trim();
          if (relay) return NextResponse.json({ message: "YouTube Music relay URL stored." });
          if (!apiKey || !channelId) throw new Error("API key and channel/playlist ID required (or set a relay HLS URL)");
          return NextResponse.json({ message: "YouTube Music credentials stored." });
        }
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Test failed" },
          { status: 400 }
        );
      }
      return NextResponse.json({ message: `${addon.name} credentials stored.` });
    }

    if (body.action === "libraries") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const libraries = await listPlexLibraries(id);
      return NextResponse.json({ libraries });
    }

    if (body.action === "sync") {
      const id = String(body.id ?? "");
      const row = await prisma.mediaIntegration.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const cfg = (row.config ?? {}) as Record<string, unknown>;
      const serverId = await resolvePlaybackLoadBalancerId(
        body.serverId ? String(body.serverId) : cfg.serverId ? String(cfg.serverId) : null
      );
      if (row.type === "plex") {
        const result = await enqueuePlexSync(id, serverId);
        return NextResponse.json({ started: true, ...result });
      }
      const existing = await resolveSyncProgress(row.config, row.id);
      if (isSyncJobActive(existing) && existing) {
        return NextResponse.json({ started: true, alreadyRunning: true, jobId: existing.jobId, progress: existing });
      }
      const jobId = randomUUID();
      const reporter = createSyncReporter(id, jobId);
      await reporter.step("queued", "Sync started…");
      after(() => runIntegrationSync(row.type, id, serverId, reporter));
      return NextResponse.json({ started: true, jobId, progress: reporter.snapshot() });
    }

    const type = String(body.type ?? "plex");

    if (MUSIC_TYPES.has(type)) {
      const existing = await prisma.mediaIntegration.findFirst({
        where: { type },
        orderBy: { createdAt: "desc" },
      });
      const rawConfig =
        body.config && typeof body.config === "object"
          ? (body.config as Record<string, unknown>)
          : Object.fromEntries(
              Object.entries(body).filter(
                ([k]) => !["type", "name", "action", "isActive", "serverId"].includes(k)
              )
            );
      const config = {
        ...rawConfig,
        serverId:
          body.serverId !== undefined
            ? body.serverId
              ? String(body.serverId)
              : null
            : rawConfig.serverId ?? null,
      } as Prisma.InputJsonValue;
      if (existing) {
        const item = await prisma.mediaIntegration.update({
          where: { id: existing.id },
          data: {
            name: String(body.name ?? existing.name),
            config,
            isActive: body.isActive !== false,
          },
        });
        return NextResponse.json({ item });
      }
      const item = await prisma.mediaIntegration.create({
        data: {
          type,
          name: String(body.name ?? type),
          config,
          isActive: body.isActive !== false,
        },
      });
      return NextResponse.json({ item });
    }

    const plexCfg = type === "plex" ? await plexConfigForSave(body) : null;
    const item = await prisma.mediaIntegration.create({
      data: {
        type,
        name: String(body.name ?? type),
        config: (plexCfg ?? {
          url: body.url ?? body.plexUrl ?? null,
          channelUrl: body.channelUrl ?? null,
          host: body.host ?? null,
          port: body.port ?? null,
          username: body.username ?? null,
          password: body.password ?? null,
          token: body.token ?? null,
          serverId: body.serverId ? String(body.serverId) : null,
          transcodeProfile: body.transcodeProfile ?? "direct",
          directStream: body.directStream !== false,
          libraryKey: body.libraryKey ? String(body.libraryKey) : null,
          libraryTitle: body.libraryTitle ? String(body.libraryTitle) : null,
        }) as Prisma.InputJsonValue,
        isActive: body.isActive !== false,
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return apiMutationErrorResponse(e, { exposeMessage: true });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const row = body.id ? await prisma.mediaIntegration.findUnique({ where: { id: String(body.id) } }) : null;
    const denied = await pluginEntitlementResponse(row?.type ?? "plex", host);
    if (denied) return denied;
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = await prisma.mediaIntegration.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const prev = (existing.config ?? {}) as Record<string, unknown>;
    const patchConfig =
      body.config && typeof body.config === "object"
        ? body.config
        : existing.type === "plex"
          ? {
              ...(await plexConfigForSave(body, prev)),
              syncProgress: prev.syncProgress,
            }
          : {
              url: body.url ?? prev.url,
              channelUrl: body.channelUrl ?? prev.channelUrl,
              host: body.host ?? prev.host,
              port: body.port ?? prev.port,
              username: body.username ?? prev.username,
              password: keepSecret(body.password, prev.password),
              token: keepSecret(body.token, prev.token),
              serverId: body.serverId !== undefined ? body.serverId || null : prev.serverId,
              transcodeProfile: body.transcodeProfile ?? prev.transcodeProfile,
              directStream: body.directStream !== undefined ? body.directStream === true : prev.directStream,
              libraryKey: body.libraryKey ?? prev.libraryKey,
              libraryTitle: body.libraryTitle ?? prev.libraryTitle,
              syncProgress: prev.syncProgress,
            };
    const item = await prisma.mediaIntegration.update({
      where: { id },
      data: {
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
        name: body.name !== undefined ? String(body.name) : undefined,
        config: patchConfig as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return apiMutationErrorResponse(e, { exposeMessage: true });
  }
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await guardAdminApiRequest(req);
  if (rateLimited) return rateLimited;

  try {
    const session = await requireSession([PanelRole.ADMIN]);
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.mediaIntegration.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiMutationErrorResponse(e);
  }
}
