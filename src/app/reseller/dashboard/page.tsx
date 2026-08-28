import { requireResellerSession, loadResellerDashboardStats } from "@/lib/reseller-dashboard-stats";
import { ResellerDashboardClient } from "./dashboard-client";

export default async function ResellerDashboardPage() {
  const session = await requireResellerSession();
  if (!session) return null;

  const initialStats = await loadResellerDashboardStats(session);

  return <ResellerDashboardClient initialStats={initialStats} />;
}
