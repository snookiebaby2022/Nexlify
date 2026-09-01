import { secureFetchWithRetry, sanitizeIpLiteral } from "@/lib/secure-fetch";

/** Geographic centroids [lat, lon] so globe pins sit in the country, not a stretched flat-map. */
const COUNTRY_LATLNG: Record<string, [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.6], BR: [-14.2, -51.9], AR: [-38.4, -63.6],
  CL: [-35.7, -71.5], CO: [4.6, -74.3], PE: [-9.2, -75.0], VE: [6.4, -66.6], EC: [-1.8, -78.2],
  BO: [-16.3, -63.6], UY: [-32.5, -55.8], PY: [-23.4, -58.4], CR: [9.7, -83.8], PA: [8.5, -80.1],
  GT: [15.8, -90.2], HN: [15.2, -86.2], NI: [12.9, -85.2], SV: [13.8, -88.9], CU: [21.5, -78.0],
  DO: [18.7, -70.2], PR: [18.2, -66.6], JM: [18.1, -77.3], TT: [10.7, -61.2],
  GB: [54.0, -2.5], IE: [53.1, -8.2], FR: [46.2, 2.2], DE: [51.2, 10.5], ES: [40.5, -3.7],
  IT: [42.8, 12.6], NL: [52.1, 5.3], BE: [50.5, 4.5], LU: [49.8, 6.1], CH: [46.8, 8.2],
  AT: [47.5, 14.6], PL: [52.0, 19.1], CZ: [49.8, 15.5], SK: [48.7, 19.7], HU: [47.2, 19.5],
  RO: [45.9, 25.0], BG: [42.7, 25.5], GR: [39.1, 21.8], PT: [39.4, -8.2], SE: [62.2, 15.3],
  NO: [64.6, 11.0], DK: [56.3, 9.5], FI: [64.0, 26.0], IS: [65.0, -18.0], EE: [58.6, 25.0],
  LV: [56.9, 24.6], LT: [55.2, 23.9], UA: [48.4, 31.2], BY: [53.7, 27.9], RU: [61.5, 90.0],
  MD: [47.4, 28.4], RS: [44.0, 21.0], HR: [45.1, 15.2], BA: [44.0, 17.7], SI: [46.1, 14.8],
  MK: [41.6, 21.7], AL: [41.2, 20.2], ME: [42.7, 19.4], XK: [42.6, 20.9], CY: [35.1, 33.4],
  MT: [35.9, 14.4], TR: [39.0, 35.2], GE: [42.3, 43.4], AM: [40.1, 45.0], AZ: [40.1, 47.6],
  AE: [23.4, 53.8], SA: [23.9, 45.1], QA: [25.3, 51.2], KW: [29.3, 47.5], BH: [26.0, 50.5],
  OM: [21.5, 55.9], YE: [15.6, 48.5], IQ: [33.2, 43.7], IR: [32.4, 53.7], IL: [31.0, 34.9],
  JO: [31.2, 36.2], LB: [33.9, 35.9], SY: [35.0, 38.0], PS: [31.9, 35.2], EG: [26.8, 30.8],
  MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.5], LY: [26.3, 17.2], SD: [15.6, 30.2],
  NG: [9.1, 8.7], GH: [7.9, -1.0], KE: [-0.02, 37.9], ZA: [-29.0, 25.0], TZ: [-6.4, 34.9],
  UG: [1.4, 32.3], ET: [9.1, 40.5], CM: [5.7, 12.4], CI: [7.5, -5.5], SN: [14.5, -14.5],
  IN: [22.4, 79.0], PK: [30.4, 69.3], BD: [23.7, 90.4], LK: [7.9, 80.8], NP: [28.4, 84.1],
  CN: [35.9, 104.2], JP: [36.2, 138.3], KR: [36.5, 127.9], TW: [23.7, 121.0], HK: [22.3, 114.2],
  MO: [22.2, 113.5], MN: [46.9, 103.8], KZ: [48.0, 67.0], UZ: [41.4, 64.6],
  AU: [-25.3, 133.8], NZ: [-40.9, 174.9], PG: [-6.3, 146.0], FJ: [-17.7, 178.1],
  PH: [12.9, 121.8], MY: [4.2, 101.9], SG: [1.35, 103.8], ID: [-2.5, 118.0], TH: [15.9, 101.0],
  VN: [14.1, 108.3], MM: [21.9, 95.9], KH: [12.6, 105.0], LA: [19.9, 102.5],
  GI: [36.1, -5.35], IM: [54.2, -4.5], JE: [49.2, -2.1], GG: [49.5, -2.6],
};

export function latLngToMapPct(lat: number, lon: number): [number, number] {
  return [
    Math.max(0, Math.min(100, ((lon + 180) / 360) * 100)),
    Math.max(0, Math.min(100, ((90 - lat) / 180) * 100)),
  ];
}

export function countryLatLng(code: string | null | undefined): [number, number] | null {
  if (!code) return null;
  return COUNTRY_LATLNG[code.toUpperCase()] ?? null;
}

/** Equirectangular x%, y% for a country centroid. Unknown codes return null (do not pile on 0,0). */
export function countryMapPosition(code: string | null | undefined): [number, number] | null {
  const ll = countryLatLng(code);
  if (!ll) return null;
  return latLngToMapPct(ll[0], ll[1]);
}

/** Deterministic in-country scatter so stacked viewers stay put across refreshes. */
export function stableCountryOffset(id: string, slot: number): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const ang = (h / 0xffffffff) * Math.PI * 2 + slot * 2.399963229728653;
  const rad = Math.min(1.15, 0.28 * Math.sqrt(slot + 1));
  return [Math.cos(ang) * rad, Math.sin(ang) * rad * 0.55];
}

export async function lookupGeoExtended(ip: string) {
  const safeIp = sanitizeIpLiteral(ip);
  if (!safeIp) {
    return {
      countryCode: null,
      countryName: null,
      city: null,
      isp: null,
      lat: null,
      lon: null,
      mapX: 50,
      mapY: 40,
    };
  }

  const { lookupGeo } = await import("./geoip");
  const geo = await lookupGeo(safeIp);

  try {
    const res = await secureFetchWithRetry(`https://ipapi.co/${encodeURIComponent(safeIp)}/json/`, {
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "NexlifyPanel/1.0" },
      retries: 2,
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      const lat = Number(data.latitude);
      const lon = Number(data.longitude);
      const cc = geo?.countryCode ?? (data.country_code ? String(data.country_code) : null);
      const countryPos = countryMapPosition(cc);
      const pos =
        countryPos ??
        (Number.isFinite(lat) && Number.isFinite(lon) ? latLngToMapPct(lat, lon) : null);
      return {
        countryCode: cc,
        countryName: geo?.countryName ?? (data.country_name ? String(data.country_name) : null),
        city: data.city ? String(data.city) : null,
        isp: data.org ? String(data.org) : null,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        mapX: pos?.[0] ?? 50,
        mapY: pos?.[1] ?? 40,
      };
    }
  } catch {
    /* fallback below */
  }

  const pos = countryMapPosition(geo?.countryCode ?? null);
  return {
    countryCode: geo?.countryCode ?? null,
    countryName: geo?.countryName ?? null,
    city: null,
    isp: null,
    lat: null,
    lon: null,
    mapX: pos?.[0] ?? 50,
    mapY: pos?.[1] ?? 40,
  };
}
