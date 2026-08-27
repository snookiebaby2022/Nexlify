const fs = require("fs");
const p = process.argv[2] || "src/lib/line-playback.ts";
let s = fs.readFileSync(p, "utf8");
const oldFn = /async function filterPlayablePlaybackUrls[\s\S]*?^}\n\n/m;
const newFn = `async function filterPlayablePlaybackUrls(
  urls: string[],
  ctx?: PlaybackContext
): Promise<string[]> {
  if (urls.length <= 1) return urls;
  const { probeUpstreamPlayable } = await import("@/lib/live-upstream-proxy");
  const ua = ctx?.userAgent;
  const slice = urls.slice(0, 4);
  const results = await Promise.all(
    slice.map(async (u) => {
      const kind = await probeUpstreamPlayable(u, { userAgent: ua, timeoutMs: 1800 });
      return kind !== "none" ? u : null;
    })
  );
  const good = results.filter((u): u is string => Boolean(u));
  return good.length ? [...good, ...urls.filter((x) => !good.includes(x))] : urls;
}

`;
if (!s.includes("filterPlayablePlaybackUrls")) {
  console.log("missing filterPlayablePlaybackUrls — run patch-line-playback-probe.cjs first");
  process.exit(1);
}
s = s.replace(oldFn, newFn);
fs.writeFileSync(p, s);
console.log("line-playback parallel probe OK");
