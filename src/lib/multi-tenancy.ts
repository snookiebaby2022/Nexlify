import { cacheGet, cacheSet } from "@/lib/cache";

const TENANT_PREFIX = "tenant:";

export type Tenant = {
  id: string;
  name: string;
  resellerId: string;
  branding: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  isActive: boolean;
};

export async function createTenant(
  name: string,
  resellerId: string,
  branding?: Tenant["branding"]
): Promise<Tenant> {
  const tenant: Tenant = {
    id: `tenant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    resellerId,
    branding: branding ?? {},
    isActive: true,
  };

  const tenants = await getTenants();
  tenants.push(tenant);
  await cacheSet(`${TENANT_PREFIX}all`, tenants, 86400);
  return tenant;
}

export async function getTenants(): Promise<Tenant[]> {
  return (await cacheGet<Tenant[]>(`${TENANT_PREFIX}all`)) ?? [];
}

export async function deleteTenant(tenantId: string): Promise<boolean> {
  const tenants = await getTenants();
  const filtered = tenants.filter((t) => t.id !== tenantId);
  await cacheSet(`${TENANT_PREFIX}all`, filtered, 86400);
  return true;
}

export async function getTenantByReseller(resellerId: string): Promise<Tenant | null> {
  const tenants = await getTenants();
  return tenants.find((t) => t.resellerId === resellerId) ?? null;
}
