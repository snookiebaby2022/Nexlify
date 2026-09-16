import { SidebarNavCustomizer } from "@/components/sidebar-nav-customizer";

export default function SidebarSettingsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Sidebar layout</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Reorder items, hide categories you do not use, and pick a menu accent colour. Changes apply only to your login.
        </p>
      </div>
      <SidebarNavCustomizer />
    </div>
  );
}
