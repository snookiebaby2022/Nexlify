/** One-shot: apply instant streaming defaults if not yet healed. */
import { ensureInstantStreamingDefaults, getSettingGroup } from "../src/lib/panel-settings";

async function main() {
  const result = await ensureInstantStreamingDefaults();
  const streams = await getSettingGroup("streams");
  const cache = await getSettingGroup("cache");
  const burst = await getSettingGroup("vod-burst");
  console.log("applied", result.applied, "groups", result.groups.join(","));
  console.log(
    "streams",
    JSON.stringify({
      flag: streams._instantStreamingDefaultsV1,
      antiFreeze: streams.antiFreezeEnabled,
      fastZap: streams.fastZapEnabled,
      instantStart: streams.liveInstantStart,
      hlsSegmentDuration: streams.hlsSegmentDuration,
      readTimeout: streams.readTimeout,
      playbackTtl: streams.playbackUrlCacheTtlSec,
    })
  );
  console.log("cache playbackTtl", cache.playbackUrlCacheTtlSec);
  console.log("vodBurst enabled", burst.enabled);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
