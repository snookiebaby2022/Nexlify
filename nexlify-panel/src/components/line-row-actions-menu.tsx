"use client";

import { useRouter } from "next/navigation";
import {
  Ban,
  Box,
  Calendar,
  Download,
  Eye,
  MoreVertical,
  Pencil,
  Power,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";

export type LineRowForMenu = {
  id: string;
  username: string;
  password: string;
  status: string;
  maxConnections: number;
  expiresAt: string;
  externalId?: string | null;
  bouquets: { bouquet: { id: string; name: string } }[];
};

export function LineRowActionsMenu({
  line,
  onUpdated,
  open,
  onToggle,
  onClose,
}: {
  line: LineRowForMenu;
  onUpdated: () => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const router = useRouter();

  async function setStatus(status: string) {
    await fetch(`/api/admin/lines/${line.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onUpdated();
    onClose();
  }

  async function renew() {
    const days = prompt("Extend line by how many days?", "30");
    if (!days || Number(days) <= 0) return;
    await fetch(`/api/admin/lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: Number(days) }),
    });
    onUpdated();
    onClose();
  }

  async function killConnections() {
    await fetch(`/api/admin/lines/${line.id}/connections`, { method: "DELETE" });
    onUpdated();
    onClose();
  }

  async function remove() {
    if (!confirm(`Delete line "${line.username}"?`)) return;
    await fetch(`/api/admin/lines/${line.id}`, { method: "DELETE" });
    onUpdated();
    onClose();
  }

  function downloadLine() {
    const host = typeof window !== "undefined" ? window.location.host : "";
    const proto = typeof window !== "undefined" ? window.location.protocol : "https:";
    const m3u = `${proto}//${host}/get.php?username=${encodeURIComponent(line.username)}&password=${encodeURIComponent(line.password)}&type=m3u_plus&output=ts`;
    const blob = new Blob(
      [`Username: ${line.username}\nPassword: ${line.password}\nM3U: ${m3u}\n`],
      { type: "text/plain" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${line.username}-line.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    onClose();
  }

  const items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] = [
    {
      label: line.status === "ACTIVE" ? "Disable" : "Enable",
      icon: <Power size={14} />,
      onClick: () => setStatus(line.status === "ACTIVE" ? "DISABLED" : "ACTIVE"),
    },
    { label: "Download line", icon: <Download size={14} />, onClick: downloadLine },
    {
      label: "View connection history",
      icon: <Eye size={14} />,
      onClick: () => {
        router.push(`/admin/line_activity?lineId=${encodeURIComponent(line.id)}`);
        onClose();
      },
    },
    { label: "Renew (extend)", icon: <Calendar size={14} />, onClick: () => void renew() },
    {
      label: "Generate code",
      icon: <RefreshCw size={14} />,
      onClick: () => {
        alert("Use Settings → Access codes or create a code linked to a package.");
        onClose();
      },
    },
    { label: "Kill connection", icon: <Ban size={14} />, onClick: () => void killConnections() },
    {
      label: "Click to ban the line",
      icon: <Ban size={14} />,
      onClick: () => setStatus("BANNED"),
      danger: true,
    },
    {
      label: "Convert to MAG",
      icon: <Box size={14} />,
      onClick: () => {
        router.push(`/admin/mag/add?lineId=${encodeURIComponent(line.id)}`);
        onClose();
      },
    },
    {
      label: "Sync with package",
      icon: <RotateCw size={14} />,
      onClick: () => {
        alert("Assign bouquets from a package on the edit screen, or recreate the line with a package.");
        onClose();
      },
    },
    {
      label: "Edit",
      icon: <Pencil size={14} />,
      onClick: () => {
        router.push(`/admin/lines?edit=${encodeURIComponent(line.id)}`);
        onClose();
      },
    },
    { label: "Delete", icon: <Trash2 size={14} />, onClick: () => void remove(), danger: true },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        className="xui-lines-action-btn"
        onClick={onToggle}
        aria-label="Line actions"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="xui-lines-action-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`xui-lines-action-menu-item ${item.danger ? "xui-lines-action-menu-item--danger" : ""}`}
              onClick={item.onClick}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
