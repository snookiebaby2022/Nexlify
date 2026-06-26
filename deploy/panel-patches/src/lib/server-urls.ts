import { getSettingGroup } from "@/lib/panel-settings";
import { magPortalUrl } from "@/lib/mag";
import { pickPublicOrigin } from "@/lib/public-origin";

function trimUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export type ResolvedServerUrls = {
  serverUrl: string;
  magServerUrl: string;
  enigmaServerUrl: string;
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

  return { serverUrl, magServerUrl, enigmaServerUrl };
}
