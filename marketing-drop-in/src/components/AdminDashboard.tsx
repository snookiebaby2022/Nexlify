"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  Folder,
  Globe,
  HeartPulse,
  KeyRound,
  Mail,
  Package,
  Radio,
  Receipt,
  ScrollText,
  Settings,
  Ticket,
  Unlock,
  Upload,
  Users,
} from "lucide-react";
import { AdminStats } from "@/components/AdminStats";
import { AdminPanel } from "@/components/AdminPanel";
import { AdminOrders } from "@/components/AdminOrders";
import { AdminUsers } from "@/components/AdminUsers";
import { AdminTickets } from "@/components/AdminTickets";
import { AdminNewsletter } from "@/components/AdminNewsletter";
import { AdminMarketing } from "@/components/AdminMarketing";
import { AdminPlans } from "@/components/AdminPlans";
import { AdminBilling } from "@/components/AdminBilling";
import { AdminDeploy } from "@/components/AdminDeploy";
import { AdminHealth } from "@/components/AdminHealth";
import { AdminSiteSettings } from "@/components/AdminSiteSettings";
import { AdminAuditLog } from "@/components/AdminAuditLog";
import { AdminContent } from "@/components/AdminContent";
import { AdminRemoteUpdate } from "@/components/AdminRemoteUpdate";
import { AdminCategories } from "@/components/AdminCategories";
import { AdminUnlockIP } from "@/components/AdminUnlockIP";
import { AdminAnnouncements } from "@/components/AdminAnnouncements";
import {
  AdminTicketAlertsBanner,
  TicketAttentionBadge,
} from "@/components/AdminTicketAlerts";
import { useAdminTicketAlerts } from "@/hooks/useAdminTicketAlerts";

const NAV_GROUPS = [
  {
    label: "Dashboard",
    items: [
      { id: "overview", label: "Overview", icon: BarChart3 },
      { id: "health", label: "Health", icon: HeartPulse },
      { id: "audit", label: "Audit Log", icon: ScrollText },
    ],
  },
  {
    label: "Commerce",
    items: [
      { id: "licenses", label: "Licenses", icon: KeyRound },
      { id: "plans", label: "Plans & checkout", icon: CreditCard },
      { id: "billing", label: "Billing", icon: Receipt },
      { id: "orders", label: "Orders", icon: Package },
    ],
  },
  {
    label: "Customers",
    items: [
      { id: "users", label: "Users", icon: Users },
      { id: "tickets", label: "Tickets", icon: Ticket },
      { id: "newsletter", label: "Newsletter", icon: Mail },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "content", label: "Blog", icon: FileText },
      { id: "marketing", label: "Marketing", icon: Globe },
      { id: "announcements", label: "Announcements", icon: Bell },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "categories", label: "Panel operator tooling", icon: Folder },
      { id: "unlock-ip", label: "Unlock IP", icon: Unlock },
      { id: "deploy", label: "Deploy", icon: Upload },
      { id: "remote", label: "Remote Update", icon: Radio },
    ],
  },
] as const;

type TabId = (typeof NAV_GROUPS)[number]["items"][number]["id"];

const TAB_LABELS: Record<TabId, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label]))
) as Record<TabId, string>;

function isTabId(value: string): value is TabId {
  return Object.prototype.hasOwnProperty.call(TAB_LABELS, value);
}

export function AdminDashboard() {
  const [tab, setTab] = useState<TabId>("overview");
  const [navQuery, setNavQuery] = useState("");
  const { alerts } = useAdminTicketAlerts({ pollMs: 25_000, desktopNotify: true });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("tab");
    if (fromQuery && isTabId(fromQuery)) setTab(fromQuery);
  }, []);

  const filteredGroups = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q) || i.id.includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [navQuery]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      <aside className="lg:w-56 shrink-0 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-2">Admin</p>
          <input
            type="search"
            placeholder="Find section…"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </div>
        <nav className="space-y-4">
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setTab(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          active
                            ? "bg-violet-600 text-white shadow-lg shadow-violet-900/30"
                            : "text-slate-400 hover:bg-slate-800/80 hover:text-white"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {item.id === "tickets" ? (
                          <TicketAttentionBadge count={alerts.needsAttention} className="ml-auto" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 space-y-6">
        <AdminTicketAlertsBanner onOpenTickets={() => setTab("tickets")} />

        <header className="border-b border-slate-800 pb-4">
          <h1 className="text-xl font-bold text-white">{TAB_LABELS[tab]}</h1>
          <p className="mt-1 text-sm text-slate-500">Nexlify marketing admin</p>
        </header>

        {tab === "overview" && <AdminStats />}
        {tab === "plans" && <AdminPlans />}
        {tab === "billing" && <AdminBilling />}
        {tab === "licenses" && <AdminPanel />}
        {tab === "orders" && <AdminOrders />}
        {tab === "users" && <AdminUsers />}
        {tab === "tickets" && <AdminTickets />}
        {tab === "newsletter" && <AdminNewsletter />}
        {tab === "content" && <AdminContent />}
        {tab === "marketing" && <AdminMarketing />}
        {tab === "announcements" && <AdminAnnouncements />}
        {tab === "settings" && <AdminSiteSettings />}
        {tab === "health" && <AdminHealth />}
        {tab === "audit" && <AdminAuditLog />}
        {tab === "categories" && <AdminCategories />}
        {tab === "unlock-ip" && <AdminUnlockIP />}
        {tab === "deploy" && <AdminDeploy />}
        {tab === "remote" && <AdminRemoteUpdate />}
      </main>
    </div>
  );
}
