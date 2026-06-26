export type GroupDashboardConfig = {
  showOnlineStreams: boolean;
  showOnlineUsers: boolean;
  showConnections: boolean;
  showCredits: boolean;
};

export type GroupConfig = {
  isSuperAdmin: boolean;
  accessAdminCp: boolean;
  canAccessOtherSubscriptions: boolean;
  limitCreditLogsAccess: boolean;
  restrictLinesToDnsOnCreate: boolean;
  accessibleUserDataRange: string;
  trialLinesAllowed: number;
  trialLinesPeriod: "hour" | "day" | "month";
  trialLinesMinCredits: number;
  subResellerCreationCost: number;
  minTransferAmount: number;
  rollbackTransactionsAllowed: number;
  rollbackLimitDays: number;
  refundIneligiblePercent: number;
  minUsernameLength: number;
  minPasswordLength: number;
  allowLineRestrictions: boolean;
  allowBouquetEditing: boolean;
  canDeleteUsers: boolean;
  showM3uDownload: boolean;
  packageIds: string[];
  dashboard: GroupDashboardConfig;
  permissions: string[];
};

export const DEFAULT_GROUP_DASHBOARD: GroupDashboardConfig = {
  showOnlineStreams: true,
  showOnlineUsers: true,
  showConnections: true,
  showCredits: true,
};

/** Default checked permissions for a standard reseller group (XUI-style preset). */
export const RECOMMENDED_RESELLER_PERMISSIONS = [
  "lines.view",
  "lines.create",
  "lines.edit",
  "lines.extend",
  "lines.trial",
  "users.view",
  "users.create",
  "users.edit",
  "credits.view",
  "credits.transfer",
  "bouquets.view",
  "streams.view",
  "vod.view",
  "mag.view",
  "mag.create",
  "tickets.view",
  "tickets.create",
  "reports.view",
] as const;

export const RECOMMENDED_SUB_RESELLER_PERMISSIONS = [
  "lines.view",
  "lines.create",
  "lines.edit",
  "lines.extend",
  "lines.trial",
  "credits.view",
  "bouquets.view",
  "streams.view",
  "vod.view",
  "mag.view",
  "tickets.view",
  "tickets.create",
  "reports.view",
] as const;

export const DEFAULT_GROUP_CONFIG: GroupConfig = {
  isSuperAdmin: false,
  accessAdminCp: false,
  canAccessOtherSubscriptions: true,
  limitCreditLogsAccess: false,
  restrictLinesToDnsOnCreate: false,
  accessibleUserDataRange: "non_super_admins",
  trialLinesAllowed: 100,
  trialLinesPeriod: "day",
  trialLinesMinCredits: 0,
  subResellerCreationCost: 0,
  minTransferAmount: 0,
  rollbackTransactionsAllowed: 0,
  rollbackLimitDays: 0,
  refundIneligiblePercent: 10,
  minUsernameLength: 8,
  minPasswordLength: 8,
  allowLineRestrictions: true,
  allowBouquetEditing: false,
  canDeleteUsers: true,
  showM3uDownload: true,
  packageIds: [],
  dashboard: { ...DEFAULT_GROUP_DASHBOARD },
  permissions: [...RECOMMENDED_RESELLER_PERMISSIONS],
};

export const RESELLER_PERMISSIONS = [
  "lines.view",
  "lines.create",
  "lines.edit",
  "lines.delete",
  "lines.extend",
  "lines.trial",
  "users.view",
  "users.create",
  "users.edit",
  "credits.view",
  "credits.transfer",
  "bouquets.view",
  "bouquets.edit",
  "streams.view",
  "vod.view",
  "mag.view",
  "mag.create",
  "tickets.view",
  "tickets.create",
  "epg.view",
  "reports.view",
  "api.access",
];

export function mergeGroupConfig(raw: unknown): GroupConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GROUP_CONFIG };
  const src = raw as Partial<GroupConfig> & { dashboard?: Partial<GroupDashboardConfig> };
  return {
    ...DEFAULT_GROUP_CONFIG,
    ...src,
    packageIds: Array.isArray(src.packageIds) ? src.packageIds.map(String) : [],
    dashboard: { ...DEFAULT_GROUP_DASHBOARD, ...(src.dashboard ?? {}) },
    permissions: Array.isArray(src.permissions)
      ? src.permissions.map(String)
      : [...DEFAULT_GROUP_CONFIG.permissions],
  };
}
