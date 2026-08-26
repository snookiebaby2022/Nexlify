import { encryptAtRest } from "@/lib/encryption-at-rest";
import { resolveServerHostGeo } from "@/lib/server-host-geo";

export async function serverGeoFields(host: string) {
  const geo = await resolveServerHostGeo(host);
  return {
    countryCode: geo.countryCode,
    region: geo.countryName ?? geo.countryCode,
  };
}

export function encodeSshPasswordOrThrow(password: unknown): string | undefined {
  if (password == null) return undefined;
  const plain = String(password);
  if (!plain) return undefined;
  return encryptAtRest(plain);
}
