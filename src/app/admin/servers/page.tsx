import { getSession } from "@/lib/auth";
import { listAdminServers } from "@/lib/admin-servers-list";
import { AdminServersClient } from "./servers-client";

export default async function AdminServersPage() {
  const session = await getSession();
  if (!session) return null;

  const initialServers = await listAdminServers();

  return <AdminServersClient initialServers={initialServers as never} />;
}
