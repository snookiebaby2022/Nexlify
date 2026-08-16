import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncVodModeFields } from "./resolve-stream-url";

describe("syncVodModeFields", () => {
  it("keeps LIVE / ON_DEMAND / CATCHUP", () => {
    assert.deepEqual(syncVodModeFields({ vodMode: "LIVE" }), { isOnDemand: false, vodMode: "LIVE" });
    assert.deepEqual(syncVodModeFields({ vodMode: "ON_DEMAND" }), {
      isOnDemand: true,
      vodMode: "ON_DEMAND",
    });
    assert.deepEqual(syncVodModeFields({ vodMode: "CATCHUP" }), {
      isOnDemand: true,
      vodMode: "CATCHUP",
    });
  });

  it("maps legacy MOVIE/SERIES to ON_DEMAND", () => {
    assert.equal(syncVodModeFields({ vodMode: "MOVIE" }).vodMode, "ON_DEMAND");
    assert.equal(syncVodModeFields({ vodMode: "SERIES" }).vodMode, "ON_DEMAND");
  });

  it("honors isOnDemand when flipping LIVE", () => {
    assert.equal(syncVodModeFields({ isOnDemand: true, vodMode: "LIVE" }).vodMode, "ON_DEMAND");
  });
});
