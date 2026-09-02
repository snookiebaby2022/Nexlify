import { getSession } from "@/lib/auth";
import { listAdminConnections } from "@/lib/admin-connections-list";
import { isConnectionQoeEnabled } from "@/lib/connection-qoe";
import { AdminConnectionsClient } from "./connections-client";

export default async function AdminConnectionsPage() {
  const session = await getSession();
  if (!session) return null;

  const initialConnections = await listAdminConnections(session);

  return (
    <AdminConnectionsClient
      initialConnections={initialConnections}
      initialQoeEnabled={isConnectionQoeEnabled()}
    />
  );
}
