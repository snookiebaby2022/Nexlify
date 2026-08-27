const fs = require("fs");
const p = process.argv[2] || "src/lib/line-playback.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes("filterPlayablePlaybackUrls")) {
  console.log("already patched");
  process.exit(0);
}
const fn = `
async function filterPlayablePlaybackUrls(
  urls: string[],
  ctx?: PlaybackContext
): Promise<string[]> {
  if (!urls.length) return urls;
  const { probeUpstreamPlayable } = await import("@/lib/live-upstream-proxy");
  const ua = ctx?.userAgent;
  const good: string[] = [];
  for (const u of urls.slice(0, 6)) {
    const kind = await probeUpstreamPlayable(u, { userAgent: ua, timeoutMs: 2500 });
    if (kind !== "none") good.push(u);
    if (good.length >= 2) break;
  }
  return good.length ? [...good, ...urls.filter((x) => !good.includes(x))] : urls;
}

`;
const anchor = "import { lineCanWatchStream } from \"@/lib/line-restrictions\";\n\n";
s = s.replace(anchor, anchor + fn);
s = s.replace(
  "const expanded = expandHlsPlaybackCandidates(signed);",
  "const playable = await filterPlayablePlaybackUrls(signed, ctx);\n  const expanded = expandHlsPlaybackCandidates(playable);"
);
fs.writeFileSync(p, s);
console.log("line-playback probe filter OK");
