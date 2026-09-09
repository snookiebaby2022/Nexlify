import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portalPath = path.join(__dirname, "..", "src", "lib", "mag-portal-html.ts");
const source = readFileSync(portalPath, "utf8");

function functionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name}() not found`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("MAG portal StbEmu-safe boot", () => {
  it("does not invoke native player/window APIs during boot", () => {
    const bootStart = source.indexOf("  // Boot is DOM/network-only.");
    assert.ok(bootStart >= 0, "boot marker not found");
    const bootAndStartup = source.slice(bootStart);
    assert.doesNotMatch(
      bootAndStartup,
      /setPlayerLayerTransparent\(|keepRemoteInPortal\(|InitPlayer|SetTopWin|SetTransparent/
    );
    assert.doesNotMatch(functionBody("deviceMac"), /\b(?:stb|gSTB)\./);
    assert.doesNotMatch(functionBody("showPortalUi"), /setPlayerLayerTransparent|keepRemoteInPortal|\b(?:stb|gSTB)\./);
    assert.doesNotMatch(functionBody("nativeDeviceMac"), /player|SetTopWin|SetTransparent|InitPlayer/);
  });

  it("limits native player work to an explicit playback action", () => {
    const playUrl = functionBody("playUrl");
    assert.match(playUrl, /bindPlayerCallbacks\(\);/);
    assert.match(playUrl, /ensurePlayerInited\(\);/);
    assert.match(playUrl, /if \(!playing\) enterPlayback\(title, snapshot\);/);
    assert.match(playUrl, /if \(html5Capable\(\)\)/);
    assert.match(playUrl, /startHtml5\(url, title, snapshot\)/);
    assert.match(functionBody("startHtml5"), /loadScript\("\/hls\.min\.js"/);
    assert.match(functionBody("kickHtml5Play"), /v\.muted = true/);
    assert.match(functionBody("html5Capable"), /MediaSource/);
    assert.match(source, /v\.id = "html5player"/);
    assert.doesNotMatch(source, /replace\(\/\\.ts\(\?/);
    assert.match(functionBody("playerSolution"), /return "ffmpeg";/);
    assert.match(functionBody("prepareVideoLayer"), /SetPIG\(0, 0, 0, 0\)/);
    assert.match(functionBody("keepRemoteInPortal"), /setTopWindow\(0\)/);
    assert.match(functionBody("enterPlayback"), /nativePlayerActive = true;/);
    assert.match(functionBody("stopNativePlayer"), /if \(!nativePlayerActive\) return;/);
  });

  it("restores the DOM portal after native playback stops or errors", () => {
    const exitPlayback = functionBody("exitPlayback");
    assert.match(exitPlayback, /showPortalUi\(\);/);
    assert.match(exitPlayback, /restoreBrowseAfterPlayback\(snapshot\);/);
    assert.doesNotMatch(exitPlayback, /keepRemoteInPortal|setPlayerLayerTransparent|showPortalChrome/);
  });

  it("routes StbEmu and Android remote actions while browsing", () => {
    const events = functionBody("bindStbEvents");
    assert.match(events, /routeRemoteKey\(keyCode/);
    assert.match(events, /roots\[i\].*?\(roots\[i\]\.event \|\| roots\[i\]\.Event\)/s);
    assert.match(functionBody("routeRemoteKey"), /onKey\(\{/);
    const onKey = functionBody("onKey");
    assert.match(onKey, /code === 19/);
    assert.match(functionBody("isEnterKey"), /code === 23/);
    assert.match(onKey, /screen === "loading"/);
  });

  it("uses the canonical slash path and records safe device diagnostics", () => {
    assert.match(source, /var API = "\/c\/";/);
    assert.match(functionBody("reportDeviceEvent"), /api\("client_event", "stb"/);
    assert.match(functionBody("startPortal"), /reportDeviceEvent\("boot"\)/);
    assert.doesNotMatch(functionBody("startPortal"), /\?mac=00:1A:79/);
  });

  it("activates rendered menu rows from touch as well as click", () => {
    const bindActivate = functionBody("bindActivate");
    assert.match(bindActivate, /el\.onclick = function/);
    assert.match(bindActivate, /action\(\);/);
    assert.match(bindActivate, /el\.ontouchend/);
    assert.match(functionBody("renderMainMenu"), /bindActivate\(el/);
    assert.match(functionBody("renderCats"), /bindActivate\(el/);
    assert.match(functionBody("renderItems"), /bindActivate\(el/);
  });
});
