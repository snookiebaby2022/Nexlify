import type { Line } from "@prisma/client";

function normalizeMac(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "");
}

/** Extract device id / MAC from Xtream/Stalker/MAG request headers or query. */
export function extractDeviceIdentity(
  headers: Headers | Record<string, string | null | undefined>,
  searchParams?: URLSearchParams
): { mac: string; deviceId: string } {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name) ?? "";
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key] ?? "") : "";
  };
  const mac =
    get("x-mac") ||
    get("x-device-mac") ||
    searchParams?.get("mac") ||
    searchParams?.get("MAC") ||
    "";
  const deviceId =
    get("x-device-id") ||
    get("x-stalker-device-id") ||
    searchParams?.get("device_id") ||
    searchParams?.get("stb_id") ||
    "";
  return { mac: normalizeMac(mac), deviceId: deviceId.trim().toLowerCase() };
}

export function checkLineDeviceLock(
  line: { lockMac?: string | null; lockDeviceId?: string | null },
  identity: { mac: string; deviceId: string }
): boolean {
  const lockMac = normalizeMac(line.lockMac);
  const lockDevice = String(line.lockDeviceId ?? "").trim().toLowerCase();
  if (!lockMac && !lockDevice) return true;
  if (lockMac && identity.mac && identity.mac === lockMac) return true;
  if (lockDevice && identity.deviceId && identity.deviceId === lockDevice) return true;
  return false;
}
