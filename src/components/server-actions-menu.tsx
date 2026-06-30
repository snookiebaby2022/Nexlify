"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, MoreVertical } from "lucide-react";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

type MenuItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "action"; label: string; action: string }
  | { kind: "delete"; label: string }
  | { kind: "divider" };

export function ServerActionsMenu({
  serverId,
  isActive = true,
  onAction,
  onDelete,
  actionMsg,
  compact = false,
}: {
  serverId: string;
  isActive?: boolean;
  onAction: (action: string) => void;
  onDelete: () => void;
  actionMsg?: string;
  /** Icon-only trigger for tight card layouts */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: MenuItem[] = [
    { kind: "link", label: "Edit server", href: `/admin/servers/${serverId}/edit` },
    { kind: "link", label: "View streams", href: `/admin/content/streams?serverId=${serverId}` },
    { kind: "link", label: "Stream health", href: "/admin/stream_health" },
    { kind: "link", label: "Connections", href: "/admin/connections" },
    { kind: "link", label: "Resource charts", href: "/admin/servers/resource-charts" },
    { kind: "link", label: "Load balancer", href: "/admin/servers/load-balancer" },
    { kind: "link", label: "Install agent", href: `/admin/servers/install?serverId=${serverId}` },
    { kind: "link", label: "Process monitor", href: "/admin/process_monitor" },
    { kind: "divider" },
    { kind: "action", label: "Test health", action: "test_health" },
    { kind: "action", label: "Mark online", action: "force_online" },
    { kind: "action", label: isActive ? "Disable server" : "Enable server", action: isActive ? "disable_server" : "enable_server" },
    { kind: "action", label: "Push config", action: "apply_config" },
    { kind: "action", label: "Reload nginx", action: "nginx_reload" },
    { kind: "action", label: "Clear cache", action: "clear_cache" },
    { kind: "action", label: "Generate agent token", action: "generate_token" },
    { kind: "action", label: "Rotate agent token", action: "rotate_token" },
    { kind: "action", label: "Revoke agent token", action: "revoke_token" },
    { kind: "divider" },
    { kind: "link", label: "Server guard (DDoS)", href: "/admin/settings/server-guard" },
    { kind: "link", label: "Geo / ISP LB settings", href: `/admin/servers/${serverId}/edit` },
    { kind: "link", label: "Issue SSL (certbot)", href: `/admin/servers/${serverId}/edit` },
    { kind: "action", label: "Reboot server", action: "reboot_server" },
    { kind: "delete", label: "Delete server" },
  ];

  const updatePosition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return;
    const menuW = menuRef.current?.offsetWidth ?? 220;
    const menuH = menuRef.current?.offsetHeight ?? 420;
    const next = computePortalMenuPosition(r, { width: menuW, height: menuH });
    setPos({ top: next.top, left: next.left });
    setFlipped(next.flipped);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const id = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(id);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      updatePosition();
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!open) updatePosition();
    setOpen((o) => !o);
  }

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <button
          type="button"
          className="xui-lines-action-backdrop"
          aria-label="Close server actions"
          onClick={() => setOpen(false)}
        />
        <div
          ref={menuRef}
          className={`xui-lines-action-menu xui-lines-action-menu--portal ${flipped ? "xui-lines-action-menu--flip" : ""}`}
          style={{ top: pos.top, left: pos.left, minWidth: "13rem", maxHeight: "min(70vh, 28rem)", overflowY: "auto" }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="xui-lines-action-menu-head">Server actions</div>
          {items.map((item, i) => {
            if (item.kind === "divider") {
              return (
                <div key={`div-${i}`} className="my-1 border-t" style={{ borderColor: "var(--border)" }} role="separator" />
              );
            }
            if (item.kind === "link") {
              return (
                <Link key={item.label} href={item.href} className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
                  {item.label}
                </Link>
              );
            }
            if (item.kind === "delete") {
              return (
                <button
                  key={item.label}
                  type="button"
                  className="xui-lines-action-menu-item xui-lines-action-menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                >
                  {item.label}
                </button>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                className="xui-lines-action-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onAction(item.action);
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </>,
      document.body
    );

  return (
    <div className="xui-lines-action-wrap xui-lines-action-wrap--server" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className={`xui-lines-action-btn xui-lines-action-btn--server ${open ? "xui-lines-action-btn--open" : ""} ${compact ? "xui-lines-action-btn--compact" : ""}`}
        aria-label="Server actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={handleToggle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {compact ? (
          <MoreVertical size={18} />
        ) : (
          <>
            <span>Actions</span>
            <ChevronDown size={14} className="xui-lines-action-chevron" aria-hidden />
          </>
        )}
      </button>
      {menu}
      {actionMsg && (
        <span className="block text-[10px] mt-0.5 max-w-[140px] truncate" style={{ color: "var(--muted)" }}>
          {actionMsg}
        </span>
      )}
    </div>
  );
}
