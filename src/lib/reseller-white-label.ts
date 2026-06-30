import { prisma } from "@/lib/prisma";
import { mergeGroupConfig } from "@/lib/group-config";

export type ResellerWhiteLabel = {
  logoUrl: string;
  accentColor: string;
  supportEmail: string;
  brandTitle: string;
};

export async function getWhiteLabelForUserId(userId: string): Promise<ResellerWhiteLabel | null> {
  const user = await prisma.panelUser.findUnique({
    where: { id: userId },
    include: { group: { select: { name: true, config: true } } },
  });
  if (!user?.group) return null;
  return whiteLabelFromGroup(user.group.name, user.group.config);
}

export async function getWhiteLabelForUsername(username: string): Promise<ResellerWhiteLabel | null> {
  const user = await prisma.panelUser.findUnique({
    where: { username },
    include: { group: { select: { name: true, config: true } } },
  });
  if (!user?.group) return null;
  return whiteLabelFromGroup(user.group.name, user.group.config);
}

function whiteLabelFromGroup(groupName: string, config: unknown): ResellerWhiteLabel | null {
  const merged = mergeGroupConfig(config);
  const wl = merged.whiteLabel;
  if (!wl.logoUrl && wl.accentColor === "#22d3ee" && !wl.supportEmail) return null;
  return {
    logoUrl: wl.logoUrl,
    accentColor: wl.accentColor || "#22d3ee",
    supportEmail: wl.supportEmail,
    brandTitle: wl.logoUrl ? groupName : process.env.NEXT_PUBLIC_PANEL_NAME ?? "Nexlify",
  };
}
