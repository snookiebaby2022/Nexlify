import { isIpHost } from "./public-origin";

export type LinePlaylistFormat = {
  label: string;
  type: string;
  output?: string;
  description?: string;
  group?: string;
  recommended?: boolean;
};

export type LinePlaylistFormatGroup = {
  id: string;
  label: string;
  formats: LinePlaylistFormat[];
};

export const LINE_PLAYLIST_FORMATS: LinePlaylistFormat[] = [
  { label: "m3u - HLS", type: "m3u", output: "hls", group: "m3u", recommended: true },
  { label: "m3u - MPEGTS", type: "m3u", output: "ts", group: "m3u" },
  { label: "m3u With Options - HLS", type: "m3u_plus", output: "hls", group: "m3u_plus", recommended: true },
  { label: "m3u With Options - MPEGTS", type: "m3u_plus", output: "ts", group: "m3u_plus" },
  { label: "WebTV List - HLS", type: "webtv", output: "hls", group: "webtv" },
  { label: "WebTV List - MPEGTS", type: "webtv", output: "ts", group: "webtv" },
  { label: "GigaBlue - MPEGTS", type: "gigablue", output: "ts", group: "device" },
];

export const LINE_ENIGMA_FORMATS: LinePlaylistFormat[] = [
  { label: "Enigma 2 OE 2.0 Auto Script P3 - HLS", type: "enigma22_script_p3_hls", group: "enigma2" },
  { label: "Enigma 2 OE 2.0 Auto Script P3 - MPEGTS", type: "enigma22_script_p3_ts", group: "enigma2" },
  { label: "Enigma 2 OE 2.0 Auto Script P2 - HLS", type: "enigma22_script_p2_hls", group: "enigma2" },
  { label: "Enigma 2 OE 2.0 Auto Script P2 - MPEGTS", type: "enigma22_script_p2_ts", group: "enigma2" },
  { label: "Enigma Simple Script - MPEGTS - Only Bouquet Update", type: "enigma_simple_bouquet", group: "enigma_simple" },
  { label: "Enigma Simple Script - MPEGTS - EPG + JMX Plugins", type: "enigma_simple_epg", group: "enigma_simple" },
  { label: "Enigma2 OE 2.0", type: "enigma22", description: "Dreambox / Enigma2 OE 2.0 bouquet script" },
  { label: "Enigma2 OE 1.6", type: "enigma16", description: "Dreambox / Enigma2 OE 1.6 bouquet script" },
];

export const LINE_PLAYLIST_FORMAT_GROUPS: LinePlaylistFormatGroup[] = [
  { id: "m3u", label: "m3u", formats: LINE_PLAYLIST_FORMATS.filter((f) => f.group === "m3u") },
  { id: "m3u_plus", label: "m3u With Options", formats: LINE_PLAYLIST_FORMATS.filter((f) => f.group === "m3u_plus") },
  { id: "webtv", label: "WebTV List", formats: LINE_PLAYLIST_FORMATS.filter((f) => f.group === "webtv") },
  { id: "device", label: "Devices", formats: LINE_PLAYLIST_FORMATS.filter((f) => f.group === "device") },
  { id: "enigma2", label: "Enigma 2 OE 2.0 Auto Script Python3", formats: LINE_ENIGMA_FORMATS.filter((f) => f.group === "enigma2") },
  { id: "enigma_simple", label: "Enigma 2 Simple Script", formats: LINE_ENIGMA_FORMATS.filter((f) => f.group === "enigma_simple") },
  {
    id: "legacy",
    label: "Legacy scripts",
    formats: LINE_ENIGMA_FORMATS.filter((f) => !f.group || f.group === undefined),
  },
];

export function allLinePlaylistFormats(): LinePlaylistFormat[] {
  return [...LINE_PLAYLIST_FORMATS, ...LINE_ENIGMA_FORMATS];
}

const INTERNAL_PANEL_PORTS = new Set(["3000", "3001", "13000", "13001"]);

/** Hostname only from a domain field (`tv.example.com` or `https://tv.example.com:443`). */
export function playlistHostnameFromDomain(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(t.includes("://") ? t : `http://${t}`);
    return u.hostname.toLowerCase();
  } catch {
    return t.replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0]?.toLowerCase() ?? "";
  }
}

/**
 * Customer playlist / Xtream URLs should use the configured domain, not the IP
 * the admin happened to open the panel on. Extra IPTV ports (8080, 25461, …) are kept.
 */
export function playlistOriginFromPreferredHost(preferredHost: string, requestOrigin: string): string {
  const req = requestOrigin.trim().replace(/\/+$/, "");
  const hostname = playlistHostnameFromDomain(preferredHost);
  if (!hostname || !req) return req;
  try {
    const u = new URL(req.includes("://") ? req : `http://${req}`);
    const port =
      u.port && !INTERNAL_PANEL_PORTS.has(u.port) && u.port !== "80" && u.port !== "443"
        ? `:${u.port}`
        : "";
    return `${u.protocol}//${hostname}${port}`;
  } catch {
    return req;
  }
}

export function pickPlaylistOrigin(requestOrigin: string, publicHosts: string[]): string {
  const req = requestOrigin.trim().replace(/\/+$/, "");
  const names = publicHosts.map((h) => playlistHostnameFromDomain(h)).filter(Boolean);
  if (!req) {
    const first = names.find((h) => !isIpHost(h));
    return first ? `http://${first}` : "";
  }
  const reqHost = playlistHostnameFromDomain(req);
  if (reqHost && names.includes(reqHost)) {
    return playlistOriginFromPreferredHost(reqHost, req);
  }
  const firstDomain = names.find((h) => !isIpHost(h));
  if (firstDomain) return playlistOriginFromPreferredHost(firstDomain, req);
  return req;
}

export function originHostAndProto(origin: string): { host: string; proto: string; origin: string } {
  const t = origin.trim().replace(/\/+$/, "");
  try {
    const u = new URL(t.includes("://") ? t : `http://${t}`);
    const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    const proto = u.protocol;
    return { host, proto, origin: `${proto}//${host}` };
  } catch {
    return { host: t, proto: "http:", origin: t };
  }
}

export function playlistFetchPath(publicUrl: string): string {
  try {
    const u = new URL(publicUrl);
    return `${u.pathname}${u.search}`;
  } catch {
    return publicUrl;
  }
}

/** Rewrite panel origin inside a downloaded M3U / Enigma script. */
export function rewritePlaylistTextOrigins(text: string, fromOrigin: string, toOrigin: string): string {
  const from = fromOrigin.replace(/\/+$/, "");
  const to = toOrigin.replace(/\/+$/, "");
  if (!from || !to || from === to) return text;
  return text.split(from).join(to);
}

export function buildLinePlaylistUrl(
  host: string,
  proto: string,
  username: string,
  password: string,
  format: LinePlaylistFormat
): string {
  const params = new URLSearchParams({
    username,
    password,
    type: format.type,
  });
  if (format.output) params.set("output", format.output);
  return `${proto}//${host}/get.php?${params.toString()}`;
}

export function buildLinePlayerApiUrl(host: string, proto: string, username: string, password: string): string {
  const params = new URLSearchParams({ username, password });
  return `${proto}//${host}/player_api.php?${params.toString()}`;
}

export function buildLineEpgUrl(host: string, proto: string, username: string, password: string): string {
  const params = new URLSearchParams({ username, password });
  return `${proto}//${host}/xmltv.php?${params.toString()}`;
}

export function buildStalkerPortalUrl(host: string, proto: string): string {
  return `${proto}//${host}/stalker_portal/c/`;
}

export function buildStalkerMacUrl(host: string, proto: string, mac: string): string {
  const clean = mac.replace(/[^a-fA-F0-9:]/g, "");
  return `${proto}//${host}/portal.php?type=stb&action=handshake&token=&JsHttpRequest=1-xml&mac=${encodeURIComponent(clean)}`;
}

export function buildWebRtcPlayerUrl(
  panelOrigin: string,
  username: string,
  password: string,
  streamId: string
): string {
  const base = panelOrigin.replace(/\/+$/, "");
  return `${base}/webrtc/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(streamId)}`;
}

export function buildWebPlayerUrl(panelOrigin: string, username: string, password: string): string {
  const override =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_WEBPLAYER_URL?.trim()
      ? process.env.NEXT_PUBLIC_WEBPLAYER_URL.trim()
      : "";
  const base = (override || panelOrigin).replace(/\/+$/, "");
  const params = new URLSearchParams({ username, password });
  if (override && !override.includes("/webplayer")) {
    params.set("server", panelOrigin.replace(/\/+$/, ""));
  }
  const path = override && !override.includes("/webplayer") ? "" : "/webplayer";
  return `${base}${path}?${params.toString()}`;
}

export function buildLineCredentialsText(
  host: string,
  proto: string,
  username: string,
  password: string,
  opts?: { mac?: string; panelOrigin?: string }
): string {
  const origin = opts?.panelOrigin ?? `${proto}//${host}`;
  const playerApi = buildLinePlayerApiUrl(host, proto, username, password);
  const epg = buildLineEpgUrl(host, proto, username, password);
  const stalker = buildStalkerPortalUrl(host, proto);
  const webplayer = buildWebPlayerUrl(origin, username, password);
  const playlistLines = [...LINE_PLAYLIST_FORMATS, ...LINE_ENIGMA_FORMATS].map(
    (f) => `${f.label}: ${buildLinePlaylistUrl(host, proto, username, password, f)}`
  );
  const lines = [
    `Username: ${username}`,
    `Password: ${password}`,
    `Server URL: ${origin}`,
    `Player API: ${playerApi}`,
    `EPG (XMLTV): ${epg}`,
    `Stalker portal: ${stalker}`,
    `Web player: ${webplayer}`,
  ];
  if (opts?.mac?.trim()) {
    lines.push(`MAG / Stalker MAC: ${opts.mac.trim()}`);
  }
  lines.push("", "Playlist URLs:", ...playlistLines);
  return lines.join("\n");
}

export function lineDisplayId(line: { id: string; externalId?: string | null }): string {
  if (line.externalId?.trim()) return line.externalId.trim();
  return line.id.slice(-8);
}

export function playlistDownloadFilename(username: string, format: LinePlaylistFormat): string {
  const ext = format.type.startsWith("enigma") ? "txt" : "m3u";
  const slug = format.label.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${username}-${slug || "playlist"}.${ext}`;
}
