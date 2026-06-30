/** Paid feature packs — WHMCS service IDs and panel settings groups. */
export type FeaturePackDef = {
  id: string;
  serviceId: string;
  name: string;
  tagline: string;
  monthlyGbp: { min: number; max: number };
  settingsHref: string;
  settingGroup: string;
  includes: string[];
  color: string;
};

export const FEATURE_PACKS: FeaturePackDef[] = [
  {
    id: "transcoding_pro",
    serviceId: "transcoding_pro",
    name: "Transcoding Pro Pack",
    tagline: "GPU-accelerated adaptive transcoding (NVENC/VAAPI/QSV) with bitrate ladders and 4K/HEVC.",
    monthlyGbp: { min: 35, max: 55 },
    settingsHref: "/admin/settings/transcoding-pack",
    settingGroup: "transcoding-pack",
    includes: [
      "NVENC, VAAPI, QuickSync auto-detection",
      "1080p/720p/480p/360p adaptive ladders",
      "Auto-fallback profiles + real-time quality hints",
      "4K HEVC/H.265 output profiles",
    ],
    color: "#f59e0b",
  },
  {
    id: "lb_pro",
    serviceId: "lb_pro",
    name: "Intelligent LB Pack",
    tagline: "Health-check routing, geo-closest server, bandwidth-aware distribution, shared session state.",
    monthlyGbp: { min: 25, max: 40 },
    settingsHref: "/admin/settings/lb-pro",
    settingGroup: "lb-pro",
    includes: [
      "Automatic failover on degraded servers",
      "Geo + bandwidth-weighted server pick",
      "LB session tracking across nodes",
      "Cloudflare/Akamai integration guidance",
    ],
    color: "#3b82f6",
  },
  {
    id: "archive_timeshift",
    serviceId: "archive_timeshift",
    name: "Archive & Timeshift Pack",
    tagline: "Server-side recording with 7–30 day retention, EPG-linked time machine, HLS/DASH pause/rewind.",
    monthlyGbp: { min: 25, max: 40 },
    settingsHref: "/admin/settings/archive-pack",
    settingGroup: "archive-pack",
    includes: [
      "Configurable retention (7–30+ days)",
      "EPG-linked automatic recording",
      "Catch-up HLS/DASH output",
      "DVR pack integration for end-users",
    ],
    color: "#8b5cf6",
  },
  {
    id: "security_shield",
    serviceId: "security_shield",
    name: "Security Shield Pack",
    tagline: "VPN/proxy/datacenter detection, IPQualityScore, auto-block, connection source logging, anti-sharing.",
    monthlyGbp: { min: 20, max: 30 },
    settingsHref: "/admin/settings/security-shield",
    settingGroup: "security-shield",
    includes: [
      "MaxMind + IPQualityScore integration",
      "Auto-block or flag VPN/hosting/proxy",
      "Per-connection source logging",
      "Advanced anti-sharing + leak audit",
    ],
    color: "#ef4444",
  },
  {
    id: "analytics_ai",
    serviceId: "analytics_ai",
    name: "Analytics + AI Pack",
    tagline: "Real-time dashboards, churn prediction, regional content heatmaps, stream optimization hints.",
    monthlyGbp: { min: 30, max: 30 },
    settingsHref: "/admin/settings/analytics-ai",
    settingGroup: "analytics-ai",
    includes: [
      "Peak concurrency + bandwidth history",
      "Churn risk scoring per line",
      "Top content by region",
      "AI EPG match/fix suggestions",
    ],
    color: "#06b6d4",
  },
  {
    id: "dvr_recording",
    serviceId: "dvr_recording",
    name: "DVR & Recording Pack",
    tagline: "End-user cloud/local DVR, scheduled recordings, portal management.",
    monthlyGbp: { min: 20, max: 35 },
    settingsHref: "/admin/settings/dvr-pack",
    settingGroup: "dvr-pack",
    includes: [
      "User-initiated recordings from portal",
      "Cloud or local storage targets",
      "Quota per line",
      "EPG schedule integration",
    ],
    color: "#ec4899",
  },
  {
    id: "full_enterprise",
    serviceId: "full_enterprise",
    name: "Full Enterprise Bundle",
    tagline: "All feature packs at discounted monthly rate.",
    monthlyGbp: { min: 80, max: 100 },
    settingsHref: "/admin/marketplace",
    settingGroup: "general",
    includes: ["All packs above", "Priority support", "White-label PWA"],
    color: "#22c55e",
  },
];

export const FULL_BUNDLE_SERVICE_IDS = FEATURE_PACKS.filter((p) => p.id !== "full_enterprise").map(
  (p) => p.serviceId
);

export function featurePackByServiceId(serviceId: string): FeaturePackDef | undefined {
  return FEATURE_PACKS.find((p) => p.serviceId === serviceId || p.id === serviceId);
}
