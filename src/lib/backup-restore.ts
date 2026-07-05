import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/cache";

const BACKUP_PREFIX = "backup:";

export type Backup = {
  id: string;
  name: string;
  createdAt: number;
  size: number;
  status: "completed" | "failed" | "in_progress";
  storagePath: string;
  includes: string[];
};

export async function createBackup(name: string, includes: string[] = ["all"]): Promise<Backup> {
  const backup: Backup = {
    id: `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    size: 0,
    status: "in_progress",
    storagePath: `/backups/${Date.now()}.tar.gz`,
    includes,
  };

  const backups = await getBackups();
  backups.push(backup);
  await cacheSet(`${BACKUP_PREFIX}all`, backups, 86400);
  return backup;
}

export async function getBackups(): Promise<Backup[]> {
  return (await cacheGet<Backup[]>(`${BACKUP_PREFIX}all`)) ?? [];
}

export async function deleteBackup(backupId: string): Promise<boolean> {
  const backups = await getBackups();
  const filtered = backups.filter((b) => b.id !== backupId);
  await cacheSet(`${BACKUP_PREFIX}all`, filtered, 86400);
  return true;
}

export async function restoreBackup(backupId: string): Promise<boolean> {
  const backups = await getBackups();
  const backup = backups.find((b) => b.id === backupId);
  if (!backup) return false;
  // In a real implementation, this would restore from the backup file
  return true;
}
