/** IANA timezone ids for panel general settings. */
export function getTimezoneOptions(): { value: string; label: string }[] {
  let ids: string[] = [];
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      ids = intl.supportedValuesOf("timeZone");
    }
  } catch {
    /* ignore */
  }

  if (!ids.length) {
    ids = FALLBACK_TIMEZONES;
  }

  return ids
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    }));
}

const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Africa/Cairo",
  "Africa/Johannesburg",
];
