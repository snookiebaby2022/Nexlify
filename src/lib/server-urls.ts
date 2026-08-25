import { magPortalUrl, stalkerPortalUrl } from "@/lib/mag";
import { getSettingGroup } from "@/lib/panel-settings";
import { listPanelPublicHostnames } from "@/lib/panel-public-hosts";
import { pickPublicOrigin } from "@/lib/public-origin";
import { pickPlaylistOrigin, playlistOriginFromPreferredHost } from "@/lib/line-playlist-urls";

function trimUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export type ResolvedServerUrls = {
  serverUrl: string;
  magServerUrl: string;
  enigmaServerUrl: string;
  stalkerPortalUrl: string;
  magHelpUrl: string;
  /** Domain-first origin for Download line / copied M3U (falls back to the request origin). */
  playlistOrigin: string;
  /** Every configured panel / rotator hostname as an origin the client can use. */
  playlistOrigins: string[];
};

/** Public panel / device portal URLs from settings (with sensible fallbacks). */
export async function resolveServerUrls(requestOrigin?: string): Promise<ResolvedServerUrls> {
  const server = await getSettingGroup("server");
  const general = await getSettingGroup("general");

  const fromSettings =
    trimUrl(String(server.serverUrl ?? "")) || trimUrl(String(general.panelUrl ?? ""));
  const fromReq = trimUrl(requestOrigin ?? "");
  const serverUrl = fromReq
    ? pickPublicOrigin(fromReq, fromSettings || process.env.NEXT_PUBLIC_SERVER_URL)
    : fromSettings || trimUrl(process.env.NEXT_PUBLIC_SERVER_URL ?? "");
  const magExplicit = trimUrl(String(server.magServerUrl ?? ""));
  const enigmaExplicit = trimUrl(String(server.enigmaServerUrl ?? ""));

  const magServerUrl = magExplicit || (serverUrl ? magPortalUrl(serverUrl) : "");
  const enigmaServerUrl = enigmaExplicit || magServerUrl || (serverUrl ? magPortalUrl(serverUrl) : "");

  const { playlistOrigin, playlistOrigins } = await resolveCustomerPlaylistOrigins(fromReq || serverUrl);

  return {
    serverUrl,
    magServerUrl,
    enigmaServerUrl,
    stalkerPortalUrl: serverUrl ? stalkerPortalUrl(serverUrl) : "",
    magHelpUrl: serverUrl ? magPortalUrl(serverUrl) : "",
    playlistOrigin,
    playlistOrigins,
  };
}

/** Origins baked into Download line / M3U links — every saved domain, otherwise IP. */
export async function resolveCustomerPlaylistOrigins(requestOrigin?: string): Promise<{
  playlistOrigin: string;
  playlistOrigins: string[];
}> {
  const req = trimUrl(requestOrigin ?? "") || trimUrl(process.env.NEXT_PUBLIC_SERVER_URL ?? "");
  const hosts = await listPanelPublicHostnames();
  const playlistOrigin = pickPlaylistOrigin(req, hosts);
  const playlistOrigins = hosts.length
    ? [...new Set(hosts.map((h) => (req ? playlistOriginFromPreferredHost(h, req) : `http://${h}`)))]
    : playlistOrigin
      ? [playlistOrigin]
      : [];
  return { playlistOrigin, playlistOrigins };
}

export async function resolveCustomerPlaylistOrigin(requestOrigin?: string): Promise<string> {
  return (await resolveCustomerPlaylistOrigins(requestOrigin)).playlistOrigin;
}
