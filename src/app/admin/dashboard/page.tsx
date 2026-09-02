import { getSession } from "@/lib/auth";
import { AdminDashboardClient } from "./dashboard-client";

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  // Client loads cached /api/admin/stats (?light=1 first) — avoid blocking TTFB on heavy DB work.
  return <AdminDashboardClient />;
}
