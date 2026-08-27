const fs = require("fs");
const p = process.argv[2] || "src/app/api/internal/live-auth/route.ts";
let s = fs.readFileSync(p, "utf8");

const oldPassthrough = `    } else if (candidates.some((u) => isHlsPlaybackUrl(u))) {
      return new NextResponse(null, { status: 204, headers: { "X-Nexlify-Passthrough": "1" } });
    }`;
const newHlsUpstream = `    } else {
      const hlsUrl = candidates.find((u) => isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));
      if (hlsUrl) upstream = hlsUrl;
    }`;
if (s.includes(oldPassthrough)) {
  s = s.replace(oldPassthrough, newHlsUpstream);
  console.log("patched spliceLiveTs HLS upstream");
}

const oldReturn = `        ...(hlsNative ? { "X-Nexlify-Hls-Native": "1" } : {}),
        ...(tsUrl ? { "X-Nexlify-Upstream": tsUrl } : {}),`;
const newReturn = `        ...(hlsNative && !tsUrl ? { "X-Nexlify-Hls-Native": "1" } : {}),
        ...((tsUrl ?? hlsNative) ? { "X-Nexlify-Upstream": tsUrl ?? hlsNative! } : {}),`;
if (s.includes(oldReturn)) {
  s = s.replace(oldReturn, newReturn);
  console.log("patched wantsHls upstream header");
}

fs.writeFileSync(p, s);
console.log("live-auth OK");
