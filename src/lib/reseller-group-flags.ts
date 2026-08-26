import { prisma } from "@/lib/prisma";
import {
  mergeGroupConfig,
  type GroupConfig,
  type GroupNavConfig,
  DEFAULT_GROUP_NAV,
} from "@/lib/group-config";

export type ResellerGroupFlags = {
  showStreamingApi: boolean;
  showM3uDownload: boolean;
  hideAllUrls: boolean;
  nav: GroupNavConfig;
};

export const DEFAULT_RESELLER_GROUP_FLAGS: ResellerGroupFlags = {
  showStreamingApi: true,
  showM3uDownload: true,
  hideAllUrls: false,
  nav: { ...DEFAULT_GROUP_NAV },
};

export function flagsFromGroupConfig(cfg: GroupConfig): ResellerGroupFlags {
  const hideAllUrls = Boolean(cfg.hideAllUrls);
  return {
    hideAllUrls,
    showStreamingApi: cfg.showStreamingApi !== false && !hideAllUrls,
    showM3uDownload: cfg.showM3uDownload !== false && !hideAllUrls,
    nav: { ...DEFAULT_GROUP_NAV, ...cfg.nav },
  };
}

export async function getResellerGroupFlags(userId: string): Promise<ResellerGroupFlags> {
  const user = await prisma.panelUser.findUnique({
    where: { id: userId },
    select: { group: { select: { config: true } } },
  });
  return flagsFromGroupConfig(mergeGroupConfig(user?.group?.config));
}
