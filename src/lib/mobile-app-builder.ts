import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const APP_PREFIX = "app:";

export type MobileApp = {
  id: string;
  name: string;
  packageName: string;
  version: string;
  status: "building" | "completed" | "failed";
  downloadUrl: string;
  createdAt: number;
  resellerId?: string;
};

export async function createMobileApp(
  name: string,
  packageName: string,
  resellerId?: string
): Promise<MobileApp> {
  const app: MobileApp = {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    packageName,
    version: "1.0.0",
    status: "building",
    downloadUrl: "",
    createdAt: Date.now(),
    resellerId,
  };

  const apps = await getMobileApps();
  apps.push(app);
  await cacheSet(`${APP_PREFIX}all`, apps, 86400);
  return app;
}

export async function getMobileApps(): Promise<MobileApp[]> {
  return (await cacheGet<MobileApp[]>(`${APP_PREFIX}all`)) ?? [];
}

export async function deleteMobileApp(appId: string): Promise<boolean> {
  const apps = await getMobileApps();
  const filtered = apps.filter((a) => a.id !== appId);
  await cacheSet(`${APP_PREFIX}all`, filtered, 86400);
  return true;
}
