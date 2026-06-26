import type { StreamProvider } from "@prisma/client";

export type ProviderLike = Pick<StreamProvider, "baseUrl" | "apiKey" | "providerType">;

function joinBasePath(baseUrl: string, providerPath: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const path = providerPath.trim();
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}/${path.replace(/^\//, "")}`;
}

/** Build playback/source URL from a configured VOD provider and relative path or ID. */
export function resolveProviderUrl(provider: ProviderLike, providerPath: string): string {
  const path = providerPath.trim();
  if (!path) throw new Error("Provider path is required");

  const type = (provider.providerType ?? "generic_url").toLowerCase();

  if (type === "xtream_vod") {
    const base = provider.baseUrl.replace(/\/$/, "");
    const clean = path.replace(/^\//, "");
    if (clean.includes("/movie/") || clean.includes("/series/")) {
      return joinBasePath(base, clean);
    }
    const ext = clean.includes(".") ? "" : ".mp4";
    let url = `${base}/movie/${clean}${ext}`;
    if (provider.apiKey) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}api_key=${encodeURIComponent(provider.apiKey)}`;
    }
    return url;
  }

  return joinBasePath(provider.baseUrl, path);
}

export const VOD_PROVIDER_TYPES = [
  { value: "generic_url", label: "Generic URL base" },
  { value: "file_host", label: "File host / CDN" },
  { value: "xtream_vod", label: "Xtream VOD API" },
  { value: "live_upstream", label: "Live upstream" },
] as const;

export function isVodProviderType(type: string | null | undefined): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "generic_url" || t === "file_host" || t === "xtream_vod";
}
