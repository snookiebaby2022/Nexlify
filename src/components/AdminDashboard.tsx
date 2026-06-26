"use client";

import { useState } from "react";
import { AdminStats } from "@/components/AdminStats";
import { AdminPanel } from "@/components/AdminPanel";
import { AdminOrders } from "@/components/AdminOrders";
import { AdminUsers } from "@/components/AdminUsers";
import { AdminTickets } from "@/components/AdminTickets";
import { AdminNewsletter } from "@/components/AdminNewsletter";
import { AdminMarketing } from "@/components/AdminMarketing";
import { AdminPlans } from "@/components/AdminPlans";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "plans", label: "Plans & Stripe" },
  { id: "licenses", label: "Licenses" },
  { id: "orders", label: "Orders" },
  { id: "users", label: "Users" },
  { id: "tickets", label: "Tickets" },
  { id: "newsletter", label: "Newsletter" },
  { id: "marketing", label: "Marketing" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminDashboard() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-violet-600 text-white"
                : "border border-slate-700 text-slate-300 hover:border-violet-500/40 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <AdminStats />}
      {tab === "plans" && <AdminPlans />}
      {tab === "licenses" && <AdminPanel />}
      {tab === "orders" && <AdminOrders />}
      {tab === "users" && <AdminUsers />}
      {tab === "tickets" && <AdminTickets />}
      {tab === "newsletter" && <AdminNewsletter />}
      {tab === "marketing" && <AdminMarketing />}
    </div>
  );
}
