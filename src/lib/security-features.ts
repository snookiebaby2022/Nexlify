import { cacheGet, cacheSet } from "@/lib/cache";

const SECURITY_PREFIX = "security:";

export type SecurityAlert = {
  id: string;
  type: "brute_force" | "suspicious_ip" | "token_leak" | "unauthorized_access";
  severity: "low" | "medium" | "high" | "critical";
  sourceIp: string;
  description: string;
  timestamp: number;
  resolved: boolean;
};

export type IPWhitelist = {
  ip: string;
  description: string;
  addedAt: number;
};

export async function createSecurityAlert(
  type: SecurityAlert["type"],
  severity: SecurityAlert["severity"],
  sourceIp: string,
  description: string
): Promise<SecurityAlert> {
  const alert: SecurityAlert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity,
    sourceIp,
    description,
    timestamp: Date.now(),
    resolved: false,
  };

  const alerts = await getSecurityAlerts();
  alerts.push(alert);
  await cacheSet(`${SECURITY_PREFIX}alerts`, alerts, 86400);
  return alert;
}

export async function getSecurityAlerts(): Promise<SecurityAlert[]> {
  return (await cacheGet<SecurityAlert[]>(`${SECURITY_PREFIX}alerts`)) ?? [];
}

export async function resolveAlert(alertId: string): Promise<boolean> {
  const alerts = await getSecurityAlerts();
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx < 0) return false;
  alerts[idx].resolved = true;
  await cacheSet(`${SECURITY_PREFIX}alerts`, alerts, 86400);
  return true;
}

export async function addToWhitelist(ip: string, description: string): Promise<IPWhitelist> {
  const entry: IPWhitelist = { ip, description, addedAt: Date.now() };
  const list = await getWhitelist();
  list.push(entry);
  await cacheSet(`${SECURITY_PREFIX}whitelist`, list, 86400);
  return entry;
}

export async function getWhitelist(): Promise<IPWhitelist[]> {
  return (await cacheGet<IPWhitelist[]>(`${SECURITY_PREFIX}whitelist`)) ?? [];
}

export async function removeFromWhitelist(ip: string): Promise<boolean> {
  const list = await getWhitelist();
  const filtered = list.filter((e) => e.ip !== ip);
  await cacheSet(`${SECURITY_PREFIX}whitelist`, filtered, 86400);
  return true;
}
