import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { clearLicenseServerBinding, setLicenseServerStatus } from "@/lib/license-server-admin";

export type PanelSyncAction =
  | "ACTIVATE"
  | "REPLACE"
  | "REVOKE"
  | "SUSPEND"
  | "UNSUSPEND"
  | "DELETE";

function panelApiSecret(): string | null {
  return (
    process.env.PANEL_API_SECRET?.trim() ??
    process.env.NEXLIFY_PANEL_API_SECRET?.trim() ??
    null
  );
}

function normalizePanelUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

export function licenseKeyHash(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

/** Latest registered panel for a customer account. */
export async function findUserPanelTarget(userId: string) {
  const row = await prisma.license.findFirst({
    where: {
      userId,
      panelUrl: { not: null },
      machineId: { not: null },
    },
    orderBy: { activatedAt: "desc" },
    select: { panelUrl: true, machineId: true },
  });
  if (!row?.panelUrl || !row.machineId) return null;
  return {
    panelUrl: normalizePanelUrl(row.panelUrl),
    machineId: row.machineId,
  };
}

async function pushToPanel(
  panelUrl: string,
  body: { action: string; licenseKey?: string }
): Promise<{ ok: boolean; error?: string }> {
  const secret = panelApiSecret();
  if (!secret) {
    return { ok: false, error: "PANEL_API_SECRET not configured" };
  }

  let res: Response;
  try {
    res = await fetch(`${panelUrl}/api/internal/license-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-panel-internal-secret": secret,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: message };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, error: `Panel HTTP ${res.status}` };
  }
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Panel HTTP ${res.status}` };
  }
  return { ok: true };
}

function actionToRemote(action: PanelSyncAction): string {
  switch (action) {
    case "ACTIVATE":
    case "REPLACE":
      return action === "ACTIVATE" ? "activate" : "replace";
    case "REVOKE":
      return "revoke";
    case "SUSPEND":
      return "suspend";
    case "UNSUSPEND":
      return "unsuspend";
    case "DELETE":
      return "delete";
  }
}

/** Queue + push a license change to the customer's panel. */
export async function syncLicenseToPanel(
  licenseId: string,
  action: PanelSyncAction,
  opts?: { licenseKey?: string }
) {
  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!license) return { pushed: false, error: "License not found" };

  const key = opts?.licenseKey ?? license.key;
  const target =
    license.panelUrl && license.machineId
      ? {
          panelUrl: normalizePanelUrl(license.panelUrl),
          machineId: license.machineId,
        }
      : await findUserPanelTarget(license.userId);

  await prisma.license.update({
    where: { id: licenseId },
    data: {
      pendingSyncAction: action,
      pendingSyncKey: action === "ACTIVATE" || action === "REPLACE" ? key : null,
    },
  });

  if (action === "REVOKE" || action === "DELETE") {
    await setLicenseServerStatus(key, "REVOKED");
  } else if (action === "SUSPEND") {
    await setLicenseServerStatus(key, "SUSPENDED");
  } else if (action === "UNSUSPEND") {
    await setLicenseServerStatus(key, "ACTIVE");
  }

  if (!target?.panelUrl) {
    return {
      pushed: false,
      error: "No panel registered — customer must activate once; change will apply on next poll",
    };
  }

  const remoteAction = actionToRemote(action);
  const pushBody: { action: string; licenseKey?: string } = { action: remoteAction };
  if (remoteAction === "activate" || remoteAction === "replace") {
    pushBody.licenseKey = key;
  }

  const result = await pushToPanel(target.panelUrl, pushBody);
  await prisma.license.update({
    where: { id: licenseId },
    data: {
      lastSyncAt: new Date(),
      lastSyncError: result.ok ? null : result.error ?? "Push failed",
      ...(result.ok
        ? { pendingSyncAction: null, pendingSyncKey: null, panelUrl: target.panelUrl }
        : {}),
    },
  });

  return { pushed: result.ok, error: result.error };
}

/** Panel calls after local activation — registers URL + instance for remote admin. */
export async function registerPanelActivation(opts: {
  licenseKey: string;
  instanceId: string;
  panelUrl: string;
  domain: string;
}) {
  const key = opts.licenseKey.trim();
  const hash = licenseKeyHash(key);
  const panelUrl = normalizePanelUrl(opts.panelUrl);

  const license = await prisma.license.findUnique({ where: { key } });
  if (!license) return { ok: false as const, error: "License not found" };

  await prisma.license.update({
    where: { id: license.id },
    data: {
      status: "ACTIVE",
      activatedAt: new Date(),
      machineId: opts.instanceId,
      panelUrl,
      pendingSyncAction: null,
      pendingSyncKey: null,
      lastSyncError: null,
    },
  });

  // Copy panel URL to sibling licenses for same user (so new issues auto-push).
  await prisma.license.updateMany({
    where: {
      userId: license.userId,
      id: { not: license.id },
      panelUrl: null,
    },
    data: { panelUrl, machineId: opts.instanceId },
  });

  return { ok: true as const, licenseId: license.id, keyHash: hash };
}

/** Poll endpoint — returns pending command for this installation. */
export async function getPendingSyncForPanel(instanceId: string, _keyHash?: string) {
  const linked = await prisma.license.findMany({
    where: { machineId: instanceId },
    select: { userId: true },
    take: 1,
  });
  const userId = linked[0]?.userId;

  const license = await prisma.license.findFirst({
    where: {
      pendingSyncAction: { not: null },
      OR: [
        { machineId: instanceId },
        ...(userId ? [{ userId }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!license?.pendingSyncAction) {
    return { action: null as null };
  }

  return {
    action: license.pendingSyncAction as PanelSyncAction,
    licenseKey: license.pendingSyncKey ?? license.key,
    licenseId: license.id,
    status: license.status,
  };
}

export async function clearPendingSync(licenseId: string, error?: string) {
  await prisma.license.update({
    where: { id: licenseId },
    data: {
      pendingSyncAction: null,
      pendingSyncKey: null,
      lastSyncAt: new Date(),
      lastSyncError: error ?? null,
    },
  });
}

export async function syncClearMachineBinding(licenseId: string) {
  const license = await prisma.license.findUnique({ where: { id: licenseId } });
  if (!license) return;
  await clearLicenseServerBinding(license.key);
}
