"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Ban,
  Box,
  Calendar,
  ChevronDown,
  Download,
  Eye,
  Pencil,
  Power,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

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
  portalEnabled = true,
}: {
  line: LineRowForMenu;
  onUpdated: () => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** When false, only the trigger renders (avoids duplicate portals for hidden mobile/desktop layouts). */
  portalEnabled?: boolean;
}) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);

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
      icon: <Power size={15} />,
      onClick: () => setStatus(line.status === "ACTIVE" ? "DISABLED" : "ACTIVE"),
    },
    { label: "Download line", icon: <Download size={15} />, onClick: downloadLine },
    {
      label: "View connection history",
      icon: <Eye size={15} />,
      onClick: () => {
        router.push(`/admin/line_activity?lineId=${encodeURIComponent(line.id)}`);
        onClose();
      },
    },
    { label: "Renew (extend)", icon: <Calendar size={15} />, onClick: () => void renew() },
    {
      label: "Generate code",
      icon: <RefreshCw size={15} />,
      onClick: () => {
        alert("Use Settings → Access codes or create a code linked to a package.");
        onClose();
      },
    },
    { label: "Kill connection", icon: <Ban size={15} />, onClick: () => void killConnections() },
    {
      label: "Ban line",
      icon: <Ban size={15} />,
      onClick: () => setStatus("BANNED"),
      danger: true,
    },
    {
      label: "Convert to MAG",
      icon: <Box size={15} />,
      onClick: () => {
        router.push(`/admin/mag/add?lineId=${encodeURIComponent(line.id)}`);
        onClose();
      },
    },
    {
      label: "Sync with package",
      icon: <RotateCw size={15} />,
      onClick: () => {
        alert("Assign bouquets from a package on the edit screen, or recreate the line with a package.");
        onClose();
      },
    },
    {
      label: "Edit",
      icon: <Pencil size={15} />,
      onClick: () => {
        router.push(`/admin/lines?edit=${encodeURIComponent(line.id)}`);
        onClose();
      },
    },
    { label: "Delete", icon: <Trash2 size={15} />, onClick: () => void remove(), danger: true },
  ];

  const updatePosition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 && r.height === 0) return;

    const menuW = menuRef.current?.offsetWidth ?? 224;
    const menuH = menuRef.current?.offsetHeight ?? 360;
    const pos = computePortalMenuPosition(r, { width: menuW, height: menuH });
    setMenuPos({ top: pos.top, left: pos.left });
    setFlipped(pos.flipped);
  }, []);

  function handleToggle() {
    if (!open) updatePosition();
    onToggle();
  }

  useLayoutEffect(() => {
    if (!open || !portalEnabled) return;
    updatePosition();
    const id = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(id);
  }, [open, portalEnabled, updatePosition]);

  useEffect(() => {
    if (!open || !portalEnabled) return;
    function onScrollOrResize() {
      updatePosition();
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, portalEnabled, updatePosition]);

  const showPortal = open && portalEnabled;

  const menu =
    showPortal &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <button
          type="button"
          className="xui-lines-action-backdrop"
          aria-label="Close actions menu"
          onClick={onClose}
        />
        <div
          ref={menuRef}
          className={`xui-lines-action-menu xui-lines-action-menu--portal ${flipped ? "xui-lines-action-menu--flip" : ""}`}
          style={{ top: menuPos.top, left: menuPos.left }}
          role="menu"
          aria-label={`Actions for ${line.username}`}
        >
          <div className="xui-lines-action-menu-head">Line actions</div>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`xui-lines-action-menu-item ${item.danger ? "xui-lines-action-menu-item--danger" : ""}`}
              onClick={item.onClick}
            >
              <span className="xui-lines-action-menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </>,
      document.body
    );

  return (
    <div className="xui-lines-action-wrap">
      <button
        ref={btnRef}
        type="button"
        className={`xui-lines-action-btn ${open ? "xui-lines-action-btn--open" : ""}`}
        onClick={handleToggle}
        aria-label={`Actions for ${line.username}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span>Actions</span>
        <ChevronDown size={14} className="xui-lines-action-chevron" aria-hidden />
      </button>
      {menu}
    </div>
  );
}
