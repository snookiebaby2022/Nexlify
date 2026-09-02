export type GroupDashboardConfig = {
  showOnlineStreams: boolean;
  showOnlineUsers: boolean;
  showConnections: boolean;
  showCredits: boolean;
  showExpiring: boolean;
  showDevices: boolean;
  showTickets: boolean;
};

export type GroupNavConfig = {
  liveConnections: boolean;
  lines: boolean;
  massEdit: boolean;
  devices: boolean;
  content: boolean;
  epg: boolean;
  subResellers: boolean;
  credits: boolean;
  tickets: boolean;
};

export type GroupWhiteLabelConfig = {
  logoUrl: string;
  accentColor: string;
  supportEmail: string;
  /** Reseller sub-panel theme (XUI-style skin). */
  themeMode?: "dark" | "light" | "auto";
  backgroundColor?: string;
  sidebarColor?: string;
  customCss?: string;
  faviconUrl?: string;
};

export type GroupRole = "admin" | "reseller" | "sub_reseller";

export type GroupConfig = {
  /** Which panel role this group is intended for (admin CP user groups / packages). */
  groupRole?: GroupRole;
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
  /** Account → Streaming API (Xtream/M3U host URLs) on the reseller panel. */
  showStreamingApi: boolean;
  /** Hide playlist hosts, domains, and stream server hostnames from reseller/sub-reseller UI. */
  hideAllUrls: boolean;
  packageIds: string[];
  dashboard: GroupDashboardConfig;
  nav: GroupNavConfig;
  permissions: string[];
  whiteLabel: GroupWhiteLabelConfig;
};

export const DEFAULT_GROUP_WHITE_LABEL: GroupWhiteLabelConfig = {
  logoUrl: "",
  accentColor: "#22d3ee",
  supportEmail: "",
  themeMode: "dark",
  backgroundColor: "",
  sidebarColor: "",
  customCss: "",
  faviconUrl: "",
};

export const DEFAULT_GROUP_DASHBOARD: GroupDashboardConfig = {
  showOnlineStreams: true,
  showOnlineUsers: true,
  showConnections: true,
  showCredits: true,
  showExpiring: true,
  showDevices: true,
  showTickets: true,
};

export const DEFAULT_GROUP_NAV: GroupNavConfig = {
  liveConnections: true,
  lines: true,
  massEdit: true,
  devices: true,
  content: true,
  epg: true,
  subResellers: true,
  credits: true,
  tickets: true,
};

export const GROUP_NAV_OPTIONS: { key: keyof GroupNavConfig; label: string; hint: string }[] = [
  { key: "liveConnections", label: "Live Connections", hint: "Who is watching right now" },
  { key: "lines", label: "Lines", hint: "Add / manage lines and bouquets" },
  { key: "massEdit", label: "Mass edit lines", hint: "Bulk line tools" },
  { key: "devices", label: "MAG & Enigma2", hint: "Device management" },
  { key: "content", label: "Content", hint: "Live streams, movies, episodes" },
  { key: "epg", label: "EPG preview", hint: "TV guide preview" },
  { key: "subResellers", label: "Sub-resellers", hint: "Create and credit child accounts" },
  { key: "credits", label: "My Credits", hint: "Account credit history" },
  { key: "tickets", label: "Tickets", hint: "Support tickets" },
];

export const PERMISSION_LABELS: Record<string, string> = {
  "lines.view": "View lines",
  "lines.create": "Create lines",
  "lines.edit": "Edit lines",
  "lines.delete": "Delete lines",
  "lines.extend": "Extend / renew lines",
  "lines.trial": "Create trial lines",
  "users.view": "View sub-resellers",
  "users.create": "Create sub-resellers",
  "users.edit": "Edit sub-resellers",
  "credits.view": "View credits",
  "credits.transfer": "Transfer credits",
  "bouquets.view": "View bouquets",
  "bouquets.edit": "Edit bouquets",
  "streams.view": "View live streams",
  "vod.view": "View movies / series",
  "mag.view": "View MAG devices",
  "mag.create": "Create MAG devices",
  "tickets.view": "View tickets",
  "tickets.create": "Create tickets",
  "epg.view": "View EPG",
  "reports.view": "View reports",
  "api.access": "Streaming API",
  "connections.view": "View live connections",
  "connections.kick": "Kick live connections",
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
  "connections.view",
  "connections.kick",
] as const;

export const RECOMMENDED_SUB_RESELLER_PERMISSIONS = [
  "lines.view",
  "lines.create",
  "lines.edit",
  "lines.extend",
  "lines.trial",
  "users.view",
  "users.create",
  "users.edit",
  "credits.view",
  "bouquets.view",
  "streams.view",
  "vod.view",
  "mag.view",
  "tickets.view",
  "tickets.create",
  "reports.view",
  "connections.view",
  "connections.kick",
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
  minUsernameLength: 6,
  minPasswordLength: 6,
  allowLineRestrictions: true,
  allowBouquetEditing: false,
  canDeleteUsers: true,
  showM3uDownload: true,
  showStreamingApi: true,
  hideAllUrls: false,
  packageIds: [],
  dashboard: { ...DEFAULT_GROUP_DASHBOARD },
  nav: { ...DEFAULT_GROUP_NAV },
  permissions: [...RECOMMENDED_RESELLER_PERMISSIONS],
  whiteLabel: { ...DEFAULT_GROUP_WHITE_LABEL },
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
  "connections.view",
  "connections.kick",
];

const VALID_GROUP_ROLES = new Set<GroupRole>(["admin", "reseller", "sub_reseller"]);

export function mergeGroupConfig(raw: unknown): GroupConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GROUP_CONFIG };
  const src = raw as Partial<GroupConfig> & {
    dashboard?: Partial<GroupDashboardConfig>;
    nav?: Partial<GroupNavConfig>;
  };
  const groupRole =
    src.groupRole && VALID_GROUP_ROLES.has(src.groupRole) ? src.groupRole : undefined;
  return {
    ...DEFAULT_GROUP_CONFIG,
    ...src,
    groupRole,
    packageIds: Array.isArray(src.packageIds) ? src.packageIds.map(String) : [],
    dashboard: { ...DEFAULT_GROUP_DASHBOARD, ...(src.dashboard ?? {}) },
    nav: { ...DEFAULT_GROUP_NAV, ...(src.nav ?? {}) },
    permissions: Array.isArray(src.permissions)
      ? src.permissions.map(String)
      : [...DEFAULT_GROUP_CONFIG.permissions],
    whiteLabel: {
      ...DEFAULT_GROUP_WHITE_LABEL,
      ...(src.whiteLabel && typeof src.whiteLabel === "object"
        ? (src.whiteLabel as Partial<GroupWhiteLabelConfig>)
        : {}),
    },
  };
}
