import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel-shell";
import { isPanelDemoHost } from "@/lib/panel-demo-host";
import { getSettingGroup } from "@/lib/panel-settings";
import { PanelRole } from "@prisma/client";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== PanelRole.ADMIN) redirect("/reseller/dashboard");

  const host = (await headers()).get("host") ?? "";
  const wl = await getSettingGroup("white-label");
  const brandTitle = String(wl.whiteLabelAppName ?? "").trim() || process.env.NEXT_PUBLIC_PANEL_NAME || "Nexlify";

  return (
    <PanelShell
      title={brandTitle}
      role="ADMIN"
      username={session.username}
      isDemo={isPanelDemoHost(host)}
      whiteLabel={{
        logoUrl: String(wl.whiteLabelLogoUrl ?? ""),
        accentColor: String(wl.whiteLabelAccentColor ?? ""),
        supportEmail: "",
        brandTitle,
        headerColor: String(wl.whiteLabelHeaderColor ?? ""),
        faviconUrl: String(wl.whiteLabelFaviconUrl ?? ""),
      }}
    >
      {children}
    </PanelShell>
  );
}
