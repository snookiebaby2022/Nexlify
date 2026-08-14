import assert from "node:assert/strict";
import test from "node:test";
import { choosePanelUpdateMode, isPanelUpdateForced } from "./panel-update-mode";

test("git repo prefers git even when a patch script and prebuilt exist", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: true,
      gitFetchOk: true,
      hasPatchScript: true,
      hasPrebuiltDownload: true,
      hasNewerRelease: true,
    }),
    "git",
  );
});

test("non-git uses prebuilt when a newer download exists", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: false,
      hasPatchScript: true,
      hasPrebuiltDownload: true,
      hasNewerRelease: true,
    }),
    "prebuilt",
  );
});

test("non-git falls back to patch tarball", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: false,
      hasPatchScript: true,
      hasPrebuiltDownload: false,
      hasNewerRelease: false,
    }),
    "patch",
  );
});

test("isPanelUpdateForced reads PANEL_UPDATE_FORCE", () => {
  assert.equal(isPanelUpdateForced({ PANEL_UPDATE_FORCE: "1" }), true);
  assert.equal(isPanelUpdateForced({ PANEL_UPDATE_FORCE: "true" }), true);
  assert.equal(isPanelUpdateForced({}), false);
});

test("git still preferred when fetch result is unknown", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: true,
      hasPatchScript: true,
      hasPrebuiltDownload: false,
      hasNewerRelease: false,
    }),
    "git",
  );
});
