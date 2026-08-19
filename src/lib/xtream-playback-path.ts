export type XtreamPlaybackKind = "live" | "movie" | "series" | "timeshift";

export type XtreamPlaybackPath = {
  kind: XtreamPlaybackKind;
  username: string;
  password: string;
  streamKey: string;
  wantsHls: boolean;
  /** MPEG-TS live that nginx/XUI serve as a raw pipe (not a playlist). */
  spliceLiveTs: boolean;
  /** Movie/series bytes — forward Range, keep Content-Length. */
  spliceVod: boolean;
};

/** Xtream / XUI.one URL layout: /live|movie|series/user/pass/id[.ext] */
export function parseXtreamPlaybackPath(pathname: string): XtreamPlaybackPath | null {
  const path = pathname.split("?")[0] ?? pathname;
  const parts = path.split("/").filter(Boolean);
  const kind = parts[0];
  if (kind !== "live" && kind !== "movie" && kind !== "series" && kind !== "timeshift") {
    return null;
  }
  if (parts.length < 4) return null;
  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(parts[1] ?? "");
    password = decodeURIComponent(parts[2] ?? "");
  } catch {
    return null;
  }
  if (!username || !password) return null;
  const rest = parts.slice(3).join("/");
  const wantsHls =
    kind === "live" && (/\.(m3u8|hls)(?:$)/i.test(rest) || /\/hls\//i.test(rest));
  const spliceLiveTs = kind === "live" && !wantsHls && parts.length === 4;
  const spliceVod = (kind === "movie" || kind === "series") && parts.length === 4 && !wantsHls;
  return {
    kind,
    username,
    password,
    streamKey: rest,
    wantsHls,
    spliceLiveTs,
    spliceVod,
  };
}
