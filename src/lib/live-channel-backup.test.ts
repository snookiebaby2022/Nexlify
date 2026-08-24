import assert from "node:assert/strict";
import { test } from "node:test";
import {
  liveChannelBackupKey,
  liveChannelSearchStem,
  pickSiblingBackupUrl,
  streamPlaybackHost,
} from "./live-channel-backup";

test("liveChannelBackupKey treats Select/Icons quality variants as the same channel", () => {
  assert.equal(
    liveChannelBackupKey("Sky Cinema Select / Icons HD"),
    liveChannelBackupKey("Sky Cinema Select / Icons FHD")
  );
  assert.equal(
    liveChannelBackupKey("Sky Cinema Select / Icons HD"),
    liveChannelBackupKey("Sky Cinema Select / Icons HEVC HB (1080p)")
  );
  assert.equal(
    liveChannelBackupKey("Sky Cinema Select / Icons HD"),
    liveChannelBackupKey("Sky Cinema Select HD")
  );
  assert.notEqual(
    liveChannelBackupKey("Sky Cinema Select HD"),
    liveChannelBackupKey("Sky Cinema Action HD")
  );
});

test("liveChannelSearchStem keeps enough of the title for a contains lookup", () => {
  const stem = liveChannelSearchStem("Sky Cinema Select / Icons HEVC HB (1080p)");
  assert.match(stem, /sky cinema select/i);
  assert.doesNotMatch(stem, /hevc/i);
});

test("pickSiblingBackupUrl prefers a different live host and skips known-dead hosts", () => {
  const stream = {
    id: "a",
    name: "Sky Cinema Select / Icons HD",
    streamUrl: "http://junki3monk3y.com:80/u/p/1",
  };
  assert.equal(streamPlaybackHost(stream.streamUrl), "junki3monk3y.com");
  assert.equal(
    pickSiblingBackupUrl(stream, [
      { id: "b", name: "Sky Cinema Select / Icons FHD", streamUrl: "http://junki3monk3y.com:80/u/p/2" },
      { id: "c", name: "Sky Cinema Select SD", streamUrl: "http://xplatinmedia.com:8080/u/p/3" },
      { id: "d", name: "Sky Cinema Select HD", streamUrl: "http://zee-portal.xyz:80/u/p/4" },
    ]),
    "http://zee-portal.xyz:80/u/p/4"
  );
});
