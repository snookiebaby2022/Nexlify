import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PANEL_BREAKPOINTS, PANEL_LAYOUT_QUERIES } from "./panel-breakpoints";

describe("panel breakpoints", () => {
  it("uses non-overlapping compact and tablet ranges", () => {
    assert.equal(PANEL_BREAKPOINTS.compactMax + 1, PANEL_BREAKPOINTS.tabletMin);
    assert.equal(PANEL_BREAKPOINTS.tabletMax + 1, PANEL_BREAKPOINTS.desktopMin);
  });

  it("exposes stable media-query strings", () => {
    assert.match(PANEL_LAYOUT_QUERIES.compact, /max-width:\s*767px/);
    assert.match(PANEL_LAYOUT_QUERIES.tablet, /768px/);
    assert.match(PANEL_LAYOUT_QUERIES.desktop, /1024px/);
    assert.match(PANEL_LAYOUT_QUERIES.mdUp, /768px/);
  });

  it("delays desktop zoom until wide layouts", () => {
    assert.ok(PANEL_BREAKPOINTS.desktopZoomMin >= PANEL_BREAKPOINTS.desktopMin);
  });
});
