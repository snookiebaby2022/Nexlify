import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel-shell";
import { isPanelDemoHost } from "@/lib/panel-demo-host";
import { PanelRole } from "@prisma/client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== PanelRole.ADMIN) redirect("/reseller/dashboard");

  const host = (await headers()).get("host") ?? "";

  return (
    <PanelShell
      title={process.env.NEXT_PUBLIC_PANEL_NAME ?? "Nexlify"}
      role="ADMIN"
      username={session.username}
      isDemo={isPanelDemoHost(host)}
    >
      {children}
    </PanelShell>
  );
}
