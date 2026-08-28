import { getSession } from "@/lib/auth";
import { loadAdminDashboardStats } from "@/lib/dashboard-stats";
import { AdminDashboardClient } from "./dashboard-client";

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const initialStats = await loadAdminDashboardStats();

  return <AdminDashboardClient initialStats={initialStats} />;
}
