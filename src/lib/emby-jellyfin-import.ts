import { prisma } from "@/lib/prisma";
import { StreamType } from "@prisma/client";
import { buildIntegrationStreamUrl } from "@/lib/integration-stream-url";
import { linkStreamToPluginBouquet } from "@/lib/integration-bouquet";
import type { IntegrationSyncReporter } from "@/lib/integration-sync-progress";

type EmbyUser = { Id?: string; Name?: string };
type EmbyItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  ImageTags?: { Primary?: string };
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesName?: string;
};

function candidateBases(url: string, kind: "emby" | "jellyfin"): string[] {
  const trimmed = url.replace(/\/$/, "");
  if (!trimmed) return [];
  if (kind === "jellyfin") {
    return trimmed.endsWith("/jellyfin") ? [trimmed, trimmed.replace(/\/jellyfin$/, "")] : [trimmed, `${trimmed}/jellyfin`];
  }
  return trimmed.endsWith("/emby") ? [trimmed, trimmed.replace(/\/emby$/, "")] : [trimmed, `${trimmed}/emby`];
}

function describeEmbyFailure(e: unknown, kind: string): string {
  if (!(e instanceof Error)) return `Could not reach ${kind}.`;
  const cause = (e as Error & { cause?: { code?: string } }).cause;
  const code = cause?.code ?? "";
  if (e.name === "TimeoutError" || /timeout|aborted/i.test(e.message)) {
    return `${kind} timed out. This VPS must be able to reach that server URL.`;
  }
  if (code === "ECONNREFUSED") return `${kind} refused the connection. Check the URL and port.`;
  if (code === "ENOTFOUND") return `Could not resolve the ${kind} hostname.`;
  if (e.message && e.message !== "fetch failed") return e.message;
  return `Could not reach ${kind}. Check URL, API key, and firewall.`;
}

async function fetchEmbyJson<T>(url: string, apiKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-Emby-Token": apiKey,
        "X-Emby-Authorization": `MediaBrowser Client="Nexlify", Device="Panel", DeviceId="nexlify-panel", Version="1.0"`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw e;
  }
  if (!res.ok) throw new Error(`Emby/Jellyfin API HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function resolveEmbyBase(url: string, token: string, kind: "emby" | "jellyfin") {
  const bases = candidateBases(url, kind);
  let lastError: unknown;
  for (const base of bases) {
    try {
      const users = await fetchEmbyJson<EmbyUser[]>(`${base}/Users`, token);
      if (users?.[0]?.Id) return { base, users };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(describeEmbyFailure(lastError, kind));
}

async function importEmbyEpisodes(
  base: string,
  token: string,
  userId: string,
  seriesId: string,
  seriesName: string,
  kind: "emby" | "jellyfin",
  integrationId: string,
  serverId: string | null,
  skipExistingCatalog: boolean
) {
  let imported = 0;
  let skipped = 0;
  const eps = await fetchEmbyJson<{ Items?: EmbyItem[] }>(
    `${base}/Users/${userId}/Items?ParentId=${encodeURIComponent(seriesId)}&Recursive=true&IncludeItemTypes=Episode&Fields=Path&Limit=400`,
    token
  );
  for (const ep of eps.Items ?? []) {
    if (!ep.Id || !ep.Name) continue;
    const seasonNum = ep.ParentIndexNumber ?? 1;
    const episodeNum = ep.IndexNumber ?? 1;
    const name = `${seriesName} — S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")} — ${ep.Name} (${kind})`;
    const streamUrl = buildIntegrationStreamUrl(kind, integrationId, ep.Id);
    const existing = await prisma.stream.findFirst({ where: { streamUrl } });
    if (existing) {
      if (skipExistingCatalog) {
        skipped++;
        continue;
      }
      await prisma.stream.update({
        where: { id: existing.id },
        data: {
          name,
          isActive: true,
          hostedExternally: true,
          serverId: serverId ?? undefined,
          seriesName,
          seasonNum,
          episodeNum,
        },
      });
      await linkStreamToPluginBouquet(existing.id);
      skipped++;
      continue;
    }
    const stream = await prisma.stream.create({
      data: {
        name,
        type: StreamType.SERIES,
        streamUrl,
        hostedExternally: true,
        serverId: serverId ?? undefined,
        isActive: true,
        seriesName,
        seasonNum,
        episodeNum,
      },
    });
    await linkStreamToPluginBouquet(stream.id);
    imported++;
  }
  return { imported, skipped };
}

export async function listEmbyJellyfinLibraries(integrationId: string, kind: "emby" | "jellyfin") {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== kind) throw new Error(`${kind} integration not found`);
  const cfg = row.config as Record<string, unknown>;
  const token = String(cfg.token ?? "").trim();
  const url = String(cfg.url ?? "").trim();
  if (!url || !token) throw new Error("Server URL and API key required");
  const { base } = await resolveEmbyBase(url, token, kind);
  const folders = await fetchEmbyJson<{ Name?: string; ItemId?: string; CollectionType?: string }[]>(
    `${base}/Library/VirtualFolders`,
    token
  );
  return (folders ?? [])
    .filter((f) => f.ItemId && f.Name)
    .map((f) => ({
      key: String(f.ItemId),
      title: String(f.Name),
      type: f.CollectionType ?? "mixed",
    }));
}

async function importEmbyStyleLibrary(
  integrationId: string,
  kind: "emby" | "jellyfin",
  serverId?: string | null,
  reporter?: IntegrationSyncReporter
) {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== kind) throw new Error(`${kind} integration not found`);
  const cfg = row.config as Record<string, unknown>;
  const token = String(cfg.token ?? "").trim();
  const url = String(cfg.url ?? "").trim();
  if (!url || !token) throw new Error("Server URL and API key required");
  const effectiveServerId = serverId ?? (cfg.serverId ? String(cfg.serverId) : null);
  const skipExistingCatalog = cfg.skipExistingCatalog !== false;

  await reporter?.step("connect", `Connecting to ${kind}…`);
  const { base, users } = await resolveEmbyBase(url, token, kind);
  const userId = users[0]?.Id;
  if (!userId) throw new Error(`No ${kind} users found`);

  await reporter?.step("import", "Loading movies and series…");
  const items = await fetchEmbyJson<{ Items?: EmbyItem[] }>(
    `${base}/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=Path&Limit=1500${
      cfg.libraryKey ? `&ParentId=${encodeURIComponent(String(cfg.libraryKey))}` : ""
    }`,
    token
  );

  let imported = 0;
  let skipped = 0;
  const list = items.Items ?? [];
  await reporter?.counts({ total: list.length, current: 0 });

  let i = 0;
  for (const item of list) {
    i++;
    const name = item.Name?.trim();
    const id = item.Id;
    if (!name || !id) continue;
    if (i % 20 === 0) {
      await reporter?.step("import", `Importing ${i}/${list.length}…`);
      await reporter?.counts({ current: i, imported, skipped });
    }

    if (item.Type === "Series") {
      const ep = await importEmbyEpisodes(
        base,
        token,
        userId,
        id,
        name,
        kind,
        integrationId,
        effectiveServerId,
        skipExistingCatalog
      );
      imported += ep.imported;
      skipped += ep.skipped;
      continue;
    }

    const streamUrl = buildIntegrationStreamUrl(kind, integrationId, id);
    const existing = await prisma.stream.findFirst({ where: { streamUrl } });
    if (existing) {
      if (skipExistingCatalog) {
        skipped++;
        continue;
      }
      await prisma.stream.update({
        where: { id: existing.id },
        data: { name: `${name} (${kind})`, isActive: true, hostedExternally: true, serverId: effectiveServerId ?? undefined },
      });
      await linkStreamToPluginBouquet(existing.id);
      skipped++;
      continue;
    }

    const stream = await prisma.stream.create({
      data: {
        name: `${name} (${kind})`,
        type: StreamType.MOVIE,
        streamUrl,
        hostedExternally: true,
        serverId: effectiveServerId ?? undefined,
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

  const result = { ok: true, imported, skipped, total: list.length, bouquet: "Plugin imports" };
  await reporter?.done(`Synced ${imported} new · ${skipped} updated from ${kind}.`, result);
  return result;
}

export async function testEmbyStyleConnection(integrationId: string, kind: "emby" | "jellyfin") {
  const row = await prisma.mediaIntegration.findUnique({ where: { id: integrationId } });
  if (!row || row.type !== kind) throw new Error(`${kind} integration not found`);
  const cfg = row.config as Record<string, unknown>;
  const token = String(cfg.token ?? "").trim();
  const url = String(cfg.url ?? "").trim();
  if (!url || !token) throw new Error("Server URL and API key required");
  const { users } = await resolveEmbyBase(url, token, kind);
  return {
    ok: true,
    message: `Connected to ${kind} as ${users[0]?.Name || "user"} (${users.length} user${users.length === 1 ? "" : "s"}).`,
  };
}

export async function importEmbyLibrary(
  integrationId: string,
  serverId?: string | null,
  reporter?: IntegrationSyncReporter
) {
  return importEmbyStyleLibrary(integrationId, "emby", serverId, reporter);
}

export async function importJellyfinLibrary(
  integrationId: string,
  serverId?: string | null,
  reporter?: IntegrationSyncReporter
) {
  return importEmbyStyleLibrary(integrationId, "jellyfin", serverId, reporter);
}
