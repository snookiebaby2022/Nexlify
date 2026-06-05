import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { PanelRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { importPlexLibrary, importYoutubeSource } from "@/lib/media-integrations";
import { importEmbyLibrary, importJellyfinLibrary } from "@/lib/emby-jellyfin-import";
import { importMusicAddon } from "@/lib/music-import";
import { testAppleMusicConnection, testSpotifyConnection } from "@/lib/music-relay";
import { attachPluginBouquetToAllLines } from "@/lib/integration-bouquet";
import { musicAddonById } from "@/lib/music-addons-catalog";
import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";

const MUSIC_TYPES = new Set(["spotify", "apple_music", "deezer", "youtube_music"]);

export async function GET(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const type = req.nextUrl.searchParams.get("type");
  const items = await prisma.mediaIntegration.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();

  const pluginType = String(body.type ?? body.action === "sync" ? (await prisma.mediaIntegration.findUnique({ where: { id: String(body.id) } }))?.type ?? "plex" : "plex");
  if (body.action !== "test") {
    const denied = await pluginEntitlementResponse(pluginType, host);
    if (denied) return denied;
  }

  if (body.action === "test") {
    const id = String(body.id);
    const row = await prisma.mediaIntegration.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cfg = row.config as Record<string, unknown>;
    const addon = musicAddonById(row.type);
    if (!addon) {
      return NextResponse.json({ message: "Integration saved (no automated test for this type)." });
    }
    const required = addon.fields.filter((f) => !f.key.includes("optional"));
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
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Test failed" },
        { status: 400 }
      );
    }
    return NextResponse.json({ message: `${addon.name} credentials stored.` });
  }

  if (body.action === "sync") {
    const id = String(body.id);
    const serverId = body.serverId ? String(body.serverId) : null;
    const row = await prisma.mediaIntegration.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let result: Record<string, unknown>;
    if (row.type === "plex") {
      result = await importPlexLibrary(id, serverId);
    } else if (row.type === "emby") {
      result = await importEmbyLibrary(id, serverId);
    } else if (row.type === "jellyfin") {
      result = await importJellyfinLibrary(id, serverId);
    } else if (row.type in { spotify: 1, apple_music: 1, deezer: 1, youtube_music: 1 }) {
      result = await importMusicAddon(id, serverId);
    } else {
      result = await importYoutubeSource(id, serverId);
    }
    await attachPluginBouquetToAllLines();
    return NextResponse.json(result);
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
              ([k]) => !["type", "name", "action", "isActive"].includes(k)
            )
          );
    const config = rawConfig as Prisma.InputJsonValue;
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

  const item = await prisma.mediaIntegration.create({
    data: {
      type,
      name: String(body.name ?? type),
      config: {
        url: body.url ?? body.plexUrl,
        token: body.token,
        channelUrl: body.channelUrl,
        transcodeProfile: body.transcodeProfile ?? "1080p",
      },
      isActive: true,
    },
  });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const host = (req.headers.get("host") ?? "localhost").split(":")[0].toLowerCase();
  const body = await req.json();
  const row = body.id ? await prisma.mediaIntegration.findUnique({ where: { id: String(body.id) } }) : null;
  const denied = await pluginEntitlementResponse(row?.type ?? "plex", host);
  if (denied) return denied;
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const item = await prisma.mediaIntegration.update({
    where: { id },
    data: {
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      name: body.name !== undefined ? String(body.name) : undefined,
      config: body.config !== undefined ? body.config : undefined,
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession([PanelRole.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.mediaIntegration.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
