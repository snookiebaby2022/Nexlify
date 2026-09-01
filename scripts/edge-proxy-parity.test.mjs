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

  it("canonical destroys a live fan when its provider socket closes", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /upRes\.once\("close", \(\) => destroyLiveFan\(fan\)\)/);
    assert.match(canonical, /if \(!fan \|\| fan\.destroyed\) return/);
  });

  it("canonical applies fan backpressure and capacity limits", () => {
    const canonical = readEdgeSource(canonicalPath);
    assert.match(canonical, /MAX_CLIENT_LAG_BYTES/);
    assert.match(canonical, /upstreamRes\.pause\(\)/);
    assert.match(canonical, /edge fan capacity reached/);
    assert.match(canonical, /connection-pulse-batch/);
    assert.match(canonical, /userAgentIsSmartTv/);
    assert.match(canonical, /rewriteLiveTsUrlToHls/);
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
