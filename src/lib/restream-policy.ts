import { getSettingGroup } from "@/lib/panel-settings";

export async function isRestreamAllowed(): Promise<boolean> {
  const streams = await getSettingGroup("streams");
  return Boolean(streams.allowRestream);
}

export async function assertRestreamAllowedForStream(stream: {
  isCreatedChannel?: boolean;
}): Promise<string | null> {
  if (!stream.isCreatedChannel) return null;
  if (await isRestreamAllowed()) return null;
  return "Restreaming is disabled in Settings → Streaming";
}
