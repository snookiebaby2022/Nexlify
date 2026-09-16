"use client";

import { SidebarNavCustomizer } from "@/components/sidebar-nav-customizer";
import { useResellerGroupFlags } from "@/components/reseller-group-flags-context";

export default function ResellerSidebarSettingsPage() {
  const flags = useResellerGroupFlags();
  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Sidebar layout</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Personalize menu order, hide sections you do not use, and pick an accent colour for your reseller login.
        </p>
      </div>
      <SidebarNavCustomizer variant="reseller" resellerFlags={flags} />
    </div>
  );
}
