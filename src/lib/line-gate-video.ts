import { getSettingGroup } from "@/lib/panel-settings";
import { effectiveLineStatus } from "@/lib/lines";
import type { Line, LineStatus } from "@prisma/client";

export type LineGateVideo = {
  kind: "disabled" | "expired";
  videoUrl: string | null;
  redirectUrl: string | null;
  message: string;
};

/** Resolve branded redirect/video for disabled or expired lines (1-stream parity). */
export async function resolveLineGateVideo(
  line: Pick<Line, "status" | "expiresAt">
): Promise<LineGateVideo | null> {
  const status = effectiveLineStatus(line);
  const settings = await getSettingGroup("expiry-videos");

  if (status === ("DISABLED" as LineStatus) || status === ("BANNED" as LineStatus)) {
    const videoUrl = String(settings.disabledLineVideoUrl ?? "").trim() || null;
    const redirectUrl = String(settings.disabledLineRedirectUrl ?? "").trim() || null;
    if (!videoUrl && !redirectUrl) return null;
    return {
      kind: "disabled",
      videoUrl,
      redirectUrl,
      message: String(settings.disabledLineMessage ?? "This line is disabled."),
    };
  }

  if (status === ("EXPIRED" as LineStatus) && settings.expiryVideosEnabled === true) {
    const videoUrl = String(settings.expiryVideoUrl ?? "").trim() || null;
    const redirectUrl = String(settings.expiryVideoRedirectUrl ?? "").trim() || null;
    if (!videoUrl && !redirectUrl) return null;
    return {
      kind: "expired",
      videoUrl,
      redirectUrl,
      message: String(settings.expiryVideoMessage ?? "Your subscription has expired."),
    };
  }

  return null;
}
