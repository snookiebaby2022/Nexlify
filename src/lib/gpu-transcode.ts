import { getSettingGroup, isBundledFeaturePacksEnabled } from "@/lib/panel-settings";
import { isPluginEntitled } from "@/lib/plugin-entitlement";

export type {
  GpuEncoder,
  GpuTranscodeProfile,
} from "@/lib/gpu-transcode-ladder";
export {
  GPU_TRANSCODE_LADDER,
  pickAdaptiveProfile,
  buildGpuFfmpegArgs,
  bitrateLadderForStream,
} from "@/lib/gpu-transcode-ladder";

export async function getTranscodingPackSettings() {
  return getSettingGroup("transcoding-pack" as never);
}

export async function isTranscodingPackEnabled(panelHost?: string): Promise<boolean> {
  if (await isBundledFeaturePacksEnabled()) return true;
  const entitled = await isPluginEntitled("transcoding_pro", panelHost);
  if (!entitled.ok) return false;
  const s = await getTranscodingPackSettings();
  return s.enabled === true;
}
