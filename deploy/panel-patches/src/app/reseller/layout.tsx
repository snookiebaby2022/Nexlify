import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { PanelShell } from "@/components/panel-shell";

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || (session.role !== "RESELLER" && session.role !== "SUB_RESELLER")) {
    redirect("/login");
  }

  return (
    <PanelShell
      title={process.env.NEXT_PUBLIC_PANEL_NAME ?? "Nexlify"}
      role="RESELLER"
      username={session.username}
    >
      {children}
    </PanelShell>
  );
}
