import { getSession } from "@/lib/auth";
import { listAdminBouquets } from "@/lib/admin-bouquets-list";
import { AdminBouquetsClient } from "./bouquets-client";

export default async function AdminBouquetsPage() {
  const session = await getSession();
  if (!session) return null;

  const initialBouquets = await listAdminBouquets(session);

  return <AdminBouquetsClient initialBouquets={initialBouquets} />;
}
