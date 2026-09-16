import { prisma } from "@/lib/prisma";

export type AdminUiPreferences = {
  sidebarOrder?: string[];
  /** Top-level sidebar entry keys to hide for this user (see sidebarEntryKey). */
  sidebarHiddenKeys?: string[];
  /** Hex or CSS color for sidebar accent highlights (optional). */
  sidebarAccentColor?: string;
};

function prefsKey(userId: string) {
  return `admin_ui_prefs:${userId}`;
}

export function sidebarEntryKey(entry: { kind: "link"; link: { href: string } } | { kind: "group"; group: { id: string } }): string {
  return entry.kind === "link" ? `link:${entry.link.href.split("?")[0]}` : `group:${entry.group.id}`;
}

export async function getAdminUiPreferences(userId: string): Promise<AdminUiPreferences> {
  const row = await prisma.panelSetting.findUnique({ where: { key: prefsKey(userId) } });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value) as AdminUiPreferences;
    if (!parsed || typeof parsed !== "object") return {};
    if (parsed.sidebarOrder && !Array.isArray(parsed.sidebarOrder)) delete parsed.sidebarOrder;
    if (parsed.sidebarHiddenKeys && !Array.isArray(parsed.sidebarHiddenKeys)) delete parsed.sidebarHiddenKeys;
    if (typeof parsed.sidebarAccentColor === "string" && !parsed.sidebarAccentColor.trim()) {
      delete parsed.sidebarAccentColor;
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function saveAdminUiPreferences(userId: string, patch: AdminUiPreferences): Promise<AdminUiPreferences> {
  const current = await getAdminUiPreferences(userId);
  const next: AdminUiPreferences = { ...current, ...patch };
  if (patch.sidebarOrder) {
    next.sidebarOrder = patch.sidebarOrder.filter((k) => typeof k === "string" && k.trim());
  }
  if (patch.sidebarHiddenKeys) {
    next.sidebarHiddenKeys = patch.sidebarHiddenKeys.filter((k) => typeof k === "string" && k.trim());
  }
  if (patch.sidebarAccentColor !== undefined) {
    const c = String(patch.sidebarAccentColor ?? "").trim();
    next.sidebarAccentColor = c || undefined;
  }
  await prisma.panelSetting.upsert({
    where: { key: prefsKey(userId) },
    create: { key: prefsKey(userId), value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}
