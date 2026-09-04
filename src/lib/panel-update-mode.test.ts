import assert from "node:assert/strict";
import test from "node:test";
import {
  choosePanelUpdateMode,
  isNextBuildTarballUrl,
  isPanelUpdateForced,
  preferGitPanelUpdates,
  preferTarballPanelUpdates,
  prebuiltTarballUrlsForVersion,
} from "./panel-update-mode";

test("newer release prefers published tarball over git", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: true,
      gitFetchOk: true,
      hasPatchScript: true,
      hasPrebuiltDownload: false,
      hasNewerRelease: true,
    }),
    "patch",
  );
});

test("compiled next-*.tar.gz is used when a newer release exists", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: true,
      gitFetchOk: true,
      hasPatchScript: true,
      hasPrebuiltDownload: true,
      hasNewerRelease: true,
    }),
    "prebuilt",
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

test("same-version rebuild still uses git when fetch works", () => {
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

test("failed git fetch falls back to patch tarball", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: true,
      gitFetchOk: false,
      hasPatchScript: true,
      hasPrebuiltDownload: true,
      hasNewerRelease: true,
    }),
    "prebuilt",
  );
});

test("PANEL_UPDATE_PREFER_GIT restores git-first when no tarball env", () => {
  const prevGit = process.env.PANEL_UPDATE_PREFER_GIT;
  const prevTar = process.env.PANEL_UPDATE_PREFER_TARBALL;
  process.env.PANEL_UPDATE_PREFER_GIT = "1";
  delete process.env.PANEL_UPDATE_PREFER_TARBALL;
  assert.equal(preferGitPanelUpdates(), true);
  assert.equal(preferTarballPanelUpdates(), false);
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
  if (prevGit === undefined) delete process.env.PANEL_UPDATE_PREFER_GIT;
  else process.env.PANEL_UPDATE_PREFER_GIT = prevGit;
  if (prevTar === undefined) delete process.env.PANEL_UPDATE_PREFER_TARBALL;
  else process.env.PANEL_UPDATE_PREFER_TARBALL = prevTar;
});

test("isNextBuildTarballUrl rejects the source archive", () => {
  assert.equal(isNextBuildTarballUrl("https://nexlify.live/downloads/nexlify-panel.tar.gz"), false);
  assert.equal(isNextBuildTarballUrl("https://nexlify.live/downloads/next-2.0.64.tar.gz"), true);
});

test("source feed URL rewrites to next-*.tar.gz", () => {
  const urls = prebuiltTarballUrlsForVersion(
    "2.0.66",
    "https://nexlify.live/downloads/nexlify-panel.tar.gz",
  );
  assert.equal(urls[0], "https://nexlify.live/downloads/next-2.0.66.tar.gz");
  assert.ok(urls.every((u) => isNextBuildTarballUrl(u)));
});

test("numbered release without a next tarball does not compile unless allowed", () => {
  assert.equal(
    choosePanelUpdateMode({
      isGitRepo: true,
      gitFetchOk: true,
      hasPatchScript: true,
      hasPrebuiltDownload: false,
      hasNewerRelease: true,
      allowCompile: false,
    }),
    null,
  );
});
