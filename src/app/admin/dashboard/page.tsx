import { getSession } from "@/lib/auth";
import { loadHeaderStats } from "@/lib/dashboard-stats";
import { AdminDashboardClient } from "./dashboard-client";

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  // Light header (+ cached summary) only — full stats load client-side after paint.
  const initialStats = await loadHeaderStats().catch(() => null);
  return <AdminDashboardClient initialStats={initialStats} />;
}
