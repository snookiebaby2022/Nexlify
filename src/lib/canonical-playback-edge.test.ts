import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  assertCanSetPlaybackEdgeInactive,
  isCanonicalPlaybackEdgeServer,
} from "./canonical-playback-edge";

describe("canonical-playback-edge", () => {
  const prev = process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE;

  afterEach(() => {
    if (prev === undefined) delete process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE;
    else process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE = prev;
  });

  it("detects 10gbs by name and host", () => {
    assert.equal(isCanonicalPlaybackEdgeServer({ name: "10gbs", host: "1.2.3.4" }), true);
    assert.equal(isCanonicalPlaybackEdgeServer({ name: "lb-eu", host: "209.237.141.15" }), true);
    assert.equal(isCanonicalPlaybackEdgeServer({ name: "other", host: "1.2.3.4" }), false);
  });

  it("blocks deactivating canonical edge without env flag", () => {
    delete process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE;
    const r = assertCanSetPlaybackEdgeInactive({ name: "10gbs", host: "209.237.141.15" }, false);
    assert.equal(r.ok, false);
  });

  it("allows deactivating canonical edge when ALLOW_DEACTIVATE_PLAYBACK_EDGE=1", () => {
    process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE = "1";
    const r = assertCanSetPlaybackEdgeInactive({ name: "10gbs", host: "209.237.141.15" }, false);
    assert.equal(r.ok, true);
  });

  it("allows deactivating non-canonical servers", () => {
    delete process.env.ALLOW_DEACTIVATE_PLAYBACK_EDGE;
    const r = assertCanSetPlaybackEdgeInactive({ name: "backup-lb", host: "10.0.0.2" }, false);
    assert.equal(r.ok, true);
  });
});
