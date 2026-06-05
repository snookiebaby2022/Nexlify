import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/login");

  return (
    <PanelShell
      title={process.env.NEXT_PUBLIC_PANEL_NAME ?? "Nexlify"}
      role="ADMIN"
      username={session.username}
    >
      {children}
    </PanelShell>
  );
}
