/** Approximate map positions (x%, y%) on a 360×180 equirectangular view for connection dots. */
const COUNTRY_XY: Record<string, [number, number]> = {
  US: [22, 38], CA: [18, 28], MX: [16, 48], BR: [32, 68], AR: [30, 82],
  GB: [48, 30], FR: [50, 36], DE: [52, 34], ES: [48, 40], IT: [53, 40],
  NL: [51, 32], BE: [50, 34], PL: [55, 32], SE: [54, 26], NO: [52, 24],
  RU: [68, 28], UA: [58, 34], TR: [58, 42], AE: [62, 48], SA: [60, 50],
  IN: [72, 48], PK: [68, 44], CN: [78, 40], JP: [86, 40], KR: [84, 38],
  AU: [88, 72], NZ: [94, 78], ZA: [54, 72], NG: [52, 54], EG: [56, 46],
  IE: [47, 30], PT: [46, 42], CH: [51, 36], AT: [53, 36], GR: [55, 42],
};

export function countryMapPosition(code: string | null | undefined): [number, number] | null {
  if (!code) return null;
  const c = code.toUpperCase();
  return COUNTRY_XY[c] ?? [50, 40];
}

export async function lookupGeoExtended(ip: string) {
  const { lookupGeo } = await import("./geoip");
  const geo = await lookupGeo(ip);
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "NexlifyPanel/1.0" },
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      const lat = Number(data.latitude);
      const lon = Number(data.longitude);
      const pos =
        Number.isFinite(lat) && Number.isFinite(lon)
          ? [((lon + 180) / 360) * 100, ((90 - lat) / 180) * 100] as [number, number]
          : countryMapPosition(geo?.countryCode ?? null);
      return {
        countryCode: geo?.countryCode ?? (data.country_code ? String(data.country_code) : null),
        countryName: geo?.countryName ?? (data.country_name ? String(data.country_name) : null),
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        mapX: pos?.[0] ?? 50,
        mapY: pos?.[1] ?? 40,
      };
    }
  } catch {
    /* fallback */
  }
  const pos = countryMapPosition(geo?.countryCode ?? null);
  return {
    countryCode: geo?.countryCode ?? null,
    countryName: geo?.countryName ?? null,
    lat: null,
    lon: null,
    mapX: pos?.[0] ?? 50,
    mapY: pos?.[1] ?? 40,
  };
}
