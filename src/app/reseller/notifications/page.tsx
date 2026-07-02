"use client";

import { Bell } from "lucide-react";
import { PanelNotificationsInbox } from "@/components/panel-notifications-inbox";

export default function ResellerNotificationsPage() {
  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5"
        style={{
          borderColor: "rgba(94,184,232,0.35)",
          background: "linear-gradient(135deg, rgba(94,184,232,0.12) 0%, rgba(255,69,0,0.05) 100%)",
        }}
      >
        <div className="flex gap-3">
          <Bell size={32} style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Panel updates and messages from your administrator
            </p>
          </div>
        </div>
      </div>
      <PanelNotificationsInbox />
    </div>
  );
}
