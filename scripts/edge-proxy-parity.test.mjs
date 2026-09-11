import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const canonicalPath = path.join(repoRoot, "scripts", "iptv-edge-proxy.mjs");
const installerPath = path.join(
  repoRoot,
  "marketing-drop-in",
  "public",
  "install",
  "scripts",
  "iptv-edge-proxy.mjs"
);
const installerAvailable = existsSync(installerPath);

function readEdgeSource(filePath) {
  return readFileSync(filePath, "utf8");
}

function forwardMediaGuard(source) {
  const start = source.indexOf("function forward(");
  assert.ok(start >= 0, "forward() not found");
  const requestIdx = source.indexOf("http.request(", start);
  assert.ok(requestIdx >= 0, "forward() backend proxy not found");
  const guardSlice = source.slice(start, requestIdx);
  return guardSlice;
}

describe("edge proxy installer parity", () => {
  it("installer artifact documents canonical source", { skip: !installerAvailable }, () => {
    const installer = readEdgeSource(installerPath);
    assert.match(installer, /canonical scripts\/iptv-edge-proxy\.mjs/i);
  });

  it(
    "installer forward() blocks media paths before proxying to panel (502 loop)",
    { skip: !installerAvailable },
    () => {
    const installer = readEdgeSource(installerPath);
    const guard = forwardMediaGuard(installer);
    assert.match(guard, /live\|timeshift\|movie\|series/);
    assert.match(guard, /media must splice locally/);
    }
  );

  it("canonical forward() also blocks media paths (reference)", () => {
    const canonical = readEdgeSource(canonicalPath);
    const guard = forwardMediaGuard(canonical);
    assert.match(guard, /live\|timeshift\|movie\|series/);
  });

  it("canonical reconnects live fans when provider socket closes (not hard-drop only)", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /upRes\.once\("close", gone\)/);
    assert.match(canonical, /function handleFanUpstreamGone\(fan\)/);
    assert.match(canonical, /if \(!fan \|\| fan\.destroyed\) return/);
  });

  it("canonical clears silent upstream underruns (prefix-then-stall)", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /function sweepStalledLiveFans\(/);
    assert.match(canonical, /function forceFanUpstreamReconnect\(/);
    assert.match(canonical, /IPTV_EDGE_FAN_STALL_MS/);
    assert.match(canonical, /fanStallClears/);
    assert.match(canonical, /lastUpstreamByteAt/);
  });

  it("isolates auth-redirect catalogs; optional refresh; keyframe-gates reconnect", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /function upstreamIsolatesFan\(/);
    assert.match(canonical, /junki3monk3y|mybmcdn/);
    assert.match(canonical, /IPTV_EDGE_FAN_AUTH_REFRESH_MS/);
    assert.match(canonical, /fanAuthRefresh/);
    assert.match(canonical, /authRedirectAt/);
    assert.match(canonical, /authRefresh:\s*true/);
    assert.match(canonical, /function findMpegTsKeyframeOffset\(/);
    assert.match(canonical, /holdUntilKeyframe/);
    assert.match(canonical, /armFanKeyframeHold/);
    assert.match(canonical, /LIVE_FAN_AUTH_REFRESH_MS > 0/);
  });

  it("canonical drops lagging fan clients without pausing the shared origin", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /MAX_CLIENT_LAG_BYTES/);
    assert.doesNotMatch(canonical, /upstreamRes\.pause\(\)/);
    assert.match(canonical, /edge fan capacity reached/);
    assert.match(canonical, /connection-pulse-batch/);
    assert.match(canonical, /userAgentIsSmartTv/);
    assert.match(canonical, /rewriteLiveTsUrlToHls/);
  });

  it("keeps long-lived MPEG-TS sessions active while media bytes arrive", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /function markPlaybackSessionActive\(/);
    assert.match(canonical, /markPlaybackSessionActive\(pulseCtx, now\)/);
    if (installerAvailable) {
      const installer = readEdgeSource(installerPath);
      assert.match(installer, /markPlaybackSessionActive\(pulseCtx, now\)/);
    }
  });

  it("canonical keeps SOCKS5 and VPN loopback outbound proxies on remote LBs", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /SOCKS5/);
    assert.match(canonical, /nexlify_loopback/);
    assert.match(canonical, /allowLoopback/);
    assert.match(canonical, /connectViaSocks5Edge/);
    const start = canonical.indexOf("function effectiveOutboundProxy");
    assert.ok(start >= 0);
    const slice = canonical.slice(start, start + 900);
    assert.doesNotMatch(slice, /IPTV_EDGE_REMOTE_NODE === ["']1["']\) return null/);
  });

  it(
    "installer does not forward /live/ by calling forward() without a media guard",
    { skip: !installerAvailable },
    () => {
    const installer = readEdgeSource(installerPath);
    const guard = forwardMediaGuard(installer);
    assert.ok(guard.length > 80, "forward() must include a media-path guard before backend proxy");
    }
  );
});
