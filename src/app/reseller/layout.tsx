import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel-shell";
import { isPanelDemoHost } from "@/lib/panel-demo-host";
import { getWhiteLabelForUserId } from "@/lib/reseller-white-label";
import { PanelRole } from "@prisma/client";

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === PanelRole.ADMIN) redirect("/admin/dashboard");
  if (session.role !== PanelRole.RESELLER && session.role !== PanelRole.SUB_RESELLER) {
    redirect("/login");
  }

  const host = (await headers()).get("host") ?? "";
  const whiteLabel = await getWhiteLabelForUserId(session.id);
  const brandTitle = whiteLabel?.brandTitle ?? process.env.NEXT_PUBLIC_PANEL_NAME ?? "Nexlify";

  return (
    <PanelShell
      title={brandTitle}
      role="RESELLER"
      username={session.username}
      isDemo={isPanelDemoHost(host)}
      whiteLabel={whiteLabel}
    >
      {children}
    </PanelShell>
  );
}
