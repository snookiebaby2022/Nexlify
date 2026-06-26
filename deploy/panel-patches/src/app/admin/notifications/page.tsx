"use client";

import { Megaphone } from "lucide-react";
import { PanelNotificationsAdmin } from "@/components/panel-notifications-admin";
import { PanelNotificationsInbox } from "@/components/panel-notifications-inbox";

export default function AdminNotificationsPage() {
  return (
    <div className="space-y-8">
      <div
        className="rounded-xl border p-5"
        style={{
          borderColor: "rgba(94,184,232,0.35)",
          background: "linear-gradient(135deg, rgba(94,184,232,0.12) 0%, rgba(255,69,0,0.05) 100%)",
        }}
      >
        <div className="flex gap-3">
          <Megaphone size={32} style={{ color: "var(--accent)" }} />
          <div>
            <h1 className="text-2xl font-bold">Announcements</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Send updates and messages to resellers
            </p>
          </div>
        </div>
      </div>

      <PanelNotificationsAdmin />

      <div className="space-y-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-lg font-bold">My inbox</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Messages addressed specifically to you as an admin
        </p>
        <PanelNotificationsInbox />
      </div>
    </div>
  );
}
