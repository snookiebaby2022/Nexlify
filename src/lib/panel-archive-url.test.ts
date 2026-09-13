import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedPanelArchiveUrl } from "./panel-archive-url";

describe("isAllowedPanelArchiveUrl", () => {
  it("allows nexlify.live /downloads/ HTTPS URLs", () => {
    assert.equal(isAllowedPanelArchiveUrl("https://nexlify.live/downloads/nexlify-panel.tar.gz"), true);
    assert.equal(
      isAllowedPanelArchiveUrl("https://www.nexlify.live/downloads/next-2.0.92.tar.gz?v=1"),
      true
    );
  });

  it("rejects other hosts, schemes, and credentials", () => {
    assert.equal(isAllowedPanelArchiveUrl("https://evil.example/downloads/nexlify-panel.tar.gz"), false);
    assert.equal(isAllowedPanelArchiveUrl("http://nexlify.live/downloads/nexlify-panel.tar.gz"), false);
    assert.equal(isAllowedPanelArchiveUrl("https://nexlify.live/install/panel.sh"), false);
    assert.equal(
      isAllowedPanelArchiveUrl("https://user:pass@nexlify.live/downloads/nexlify-panel.tar.gz"),
      false
    );
    assert.equal(isAllowedPanelArchiveUrl(""), false);
  });
});
