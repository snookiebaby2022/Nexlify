export type LineDeviceRef = {
  id: string;
  mac: string;
  model: string | null;
  isActive: boolean;
};

export type DeviceLineSummary = {
  id: string;
  username: string;
  status: string;
  expiresAt: string;
  bouquets?: { bouquet: { id: string; name: string } }[];
  magDevices?: LineDeviceRef[];
  enigmaDevices?: LineDeviceRef[];
};

export const DEVICE_LINE_LIST_INCLUDE = {
  username: true,
  id: true,
  status: true,
  expiresAt: true,
  bouquets: { include: { bouquet: { select: { id: true, name: true } } } },
  magDevices: { select: { id: true, mac: true, model: true, isActive: true } },
  enigmaDevices: { select: { id: true, mac: true, model: true, isActive: true } },
} as const;

export function bouquetNames(line: DeviceLineSummary): string {
  const names = (line.bouquets ?? []).map((row) => row.bouquet.name).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}

export function lineDeviceSummary(line: DeviceLineSummary): string {
  const mag = (line.magDevices ?? []).map((d) => `MAG ${d.mac}`);
  const enigma = (line.enigmaDevices ?? []).map((d) => `Enigma ${d.mac}`);
  const all = [...mag, ...enigma];
  return all.length ? all.join(" · ") : "—";
}
