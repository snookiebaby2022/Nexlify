import assert from "node:assert/strict";
import { test } from "node:test";
import { streamEpgWorking } from "./epg-working-status";

test("streamEpgWorking matches guide ids case-insensitively", () => {
  const working = new Set(["bbc1.uk"]);
  assert.equal(streamEpgWorking("BBC1.uk", working), true);
  assert.equal(streamEpgWorking(" bbc1.uk ", working), true);
  assert.equal(streamEpgWorking("ITV1.uk", working), false);
  assert.equal(streamEpgWorking("", working), false);
  assert.equal(streamEpgWorking(null, working), false);
});
