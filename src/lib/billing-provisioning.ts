import { prisma } from "@/lib/prisma";
import { handleBillingWebhook, billingUnauthorized, type BillingAction, type BillingPayload } from "@/lib/billing";
import { secretsEqual } from "@/lib/secrets-equal";

export type ProvisioningOperation =
  | "createLine"
  | "extendLine"
  | "suspendLine"
  | "unsuspendLine"
  | "terminateLine"
  | "adjustCredits"
  | "listPackages"
  | "getResellerInfo";

export type ProvisioningRequest = {
  operation: ProvisioningOperation;
  serviceId?: string;
  username?: string;
  password?: string;
  packageId?: string;
  bouquetIds?: string[];
  days?: number;
  maxConnections?: number;
  credits?: number;
  resellerUsername?: string;
  note?: string;
};

function verifyProvisioningSecret(provided: string | null): boolean {
  const expected = process.env.BILLING_WEBHOOK_SECRET;
  if (!expected?.trim()) return false;
  return secretsEqual(provided, expected);
}

function mapOperationToBilling(op: ProvisioningOperation): BillingAction | null {
  switch (op) {
    case "createLine":
      return "create";
    case "extendLine":
      return "renew";
    case "suspendLine":
      return "suspend";
    case "unsuspendLine":
      return "unsuspend";
    case "terminateLine":
      return "terminate";
    case "adjustCredits":
      return "add_credits";
    default:
      return null;
  }
}

async function resolvePackageDefaults(packageId: string | undefined) {
  if (!packageId?.trim()) return null;
  const pkg = await prisma.package.findFirst({
    where: { id: packageId.trim(), isActive: true },
    select: { days: true, bouquetIds: true, maxLines: true },
  });
  return pkg;
}

/** Normalized WHMCS / marketplace provisioning contract (signed JSON). */
export async function runProvisioningRequest(
  body: ProvisioningRequest,
  secret: string | null,
): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  if (!verifyProvisioningSecret(secret)) {
    const u = billingUnauthorized();
    return { ok: false, error: u.error };
  }

  if (body.operation === "listPackages") {
    const packages = await prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        days: true,
        creditCost: true,
        maxLines: true,
        bouquetIds: true,
        shopEnabled: true,
      },
    });
    return { ok: true, packages };
  }

  if (body.operation === "getResellerInfo") {
    const username = body.resellerUsername ?? body.username;
    if (!username?.trim()) return { ok: false, error: "resellerUsername required" };
    const user = await prisma.panelUser.findUnique({
      where: { username: username.trim() },
      select: { id: true, username: true, role: true, credits: true, isActive: true },
    });
    if (!user) return { ok: false, error: "Reseller not found" };
    return { ok: true, reseller: user };
  }

  const billingAction = mapOperationToBilling(body.operation);
  if (!billingAction) return { ok: false, error: "Unknown operation" };

  const pkg = await resolvePackageDefaults(body.packageId);
  const payload: BillingPayload = {
    action: billingAction,
    service_id: body.serviceId,
    username: body.username,
    password: body.password,
    days: body.days ?? pkg?.days,
    max_connections: body.maxConnections ?? pkg?.maxLines,
    bouquet_ids: body.bouquetIds?.length ? body.bouquetIds : pkg?.bouquetIds,
    credits: body.credits,
    reseller: body.resellerUsername,
    note: body.note,
  };

  return handleBillingWebhook(payload, secret);
}
