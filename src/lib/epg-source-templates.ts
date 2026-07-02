export type EpgSourceType = "xmltv" | "schedules_direct" | "webgrab_plus";

export const EPG_SOURCE_TYPES: {
  value: EpgSourceType;
  label: string;
  urlTemplate: string;
  hint: string;
}[] = [
  {
    value: "xmltv",
    label: "Generic XMLTV",
    urlTemplate: "https://example.com/epg.xml",
    hint: "Standard .xml or .xml.gz feed URL.",
  },
  {
    value: "schedules_direct",
    label: "SchedulesDirect",
    urlTemplate: "https://json.schedulesdirect.org/20141201/lineups/{LINEUP_ID}/schedule?token={TOKEN}",
    hint: "Replace {LINEUP_ID} and {TOKEN} with your SchedulesDirect lineup and API token.",
  },
  {
    value: "webgrab_plus",
    label: "WebGrab+Plus",
    urlTemplate: "file:///var/www/epg/webgrab/xmltv.xml",
    hint: "Local or HTTP path to WebGrab+Plus XMLTV output. Use http:// for remote WG++ hosts.",
  },
];

export function resolveEpgUrlTemplate(
  sourceType: EpgSourceType,
  config?: Record<string, unknown> | null
): string {
  const tpl = EPG_SOURCE_TYPES.find((t) => t.value === sourceType)?.urlTemplate ?? "";
  if (!config) return tpl;
  let url = tpl;
  for (const [key, val] of Object.entries(config)) {
    url = url.replace(new RegExp(`\\{${key}\\}`, "gi"), String(val ?? ""));
  }
  return url;
}
