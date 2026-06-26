import { MassDeletePanel } from "@/components/mass-delete-panel";

export default function MassDeleteUsersPage() {
  return <MassDeletePanel entity="users" title="Mass delete — users" loadUrl="/api/admin/resellers" labelKey="username" />;
}
