import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import { buildIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { linkStreamToPluginBouquet } from "@/lib/integration-bouquet";

type EmbyUser = { Id?: string; Name?: string };
type EmbyItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  ImageTags?: { Primary?: string };
};

function normalizeBase(url: string, kind: "emby" | "jellyfin") {
  const trimmed = url.replace(/\/$/, "");
  if (trimmed.endsWith("/emby") || trimmed.endsWith("/jellyfin")) return trimmed;
  return kind === "emby" ? `${trimmed}/emby` : trimmed;
}

async function fetchEmbyJson<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "X-Emby-Token": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Emby/Jellyfin API HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function importEmbyStyleLibrary(
  integrationId: string,
  kind: "emby" | "jellyfin",
  serverId?: string | null
) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== kind) throw new Error(`${kind} integration not found`);
  const cfg = row.config as Record<string, unknown>;
  const base = normalizeBase(String(cfg.url ?? ""), kind);
  const token = String(cfg.token ?? "");
  if (!base || !token) throw new Error("Server URL and API key required");

  const users = await fetchEmbyJson<EmbyUser[]>(`${base}/Users`, token);
  const userId = users[0]?.Id;
  if (!userId) throw new Error("No Emby/Jellyfin users found");

  const items = await fetchEmbyJson<{ Items?: EmbyItem[] }>(
    `${base}/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=Path&Limit=500`,
    token
  );

  let imported = 0;
  const list = items.Items ?? [];

  for (const item of list) {
    const name = item.Name?.trim();
    const id = item.Id;
    if (!name || !id) continue;
    const streamUrl = buildIntegrationStreamUrl(kind, integrationId, id);
    const type =
      item.Type === "Series" || item.Type === "Season" ? StreamType.SERIES : StreamType.MOVIE;

    const existing = await prisma.stream.findFirst({ where: { streamUrl } });
    if (existing) {
      await prisma.stream.update({
        where: { id: existing.id },
        data: { name: `${name} (${kind})`, isActive: true, hostedExternally: true },
      });
      await linkStreamToPluginBouquet(existing.id);
      continue;
    }

    const stream = await prisma.stream.create({
      data: {
        name: `${name} (${kind})`,
        type,
        streamUrl,
        hostedExternally: true,
        serverId: serverId ?? undefined,
        isActive: true,
      },
    });
    await linkStreamToPluginBouquet(stream.id);
    imported++;
  }

  await prisma.mediaIntegration.update({
    where: { id: integrationId },
    data: { lastSync: new Date() },
  });

  return { ok: true, imported, total: list.length, bouquet: "Plugin imports" };
}

export async function importEmbyLibrary(integrationId: string, serverId?: string | null) {
  return importEmbyStyleLibrary(integrationId, "emby", serverId);
}

export async function importJellyfinLibrary(integrationId: string, serverId?: string | null) {
  return importEmbyStyleLibrary(integrationId, "jellyfin", serverId);
}
