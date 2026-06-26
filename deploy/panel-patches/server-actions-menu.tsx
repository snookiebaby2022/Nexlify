"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

export function ServerActionsMenu({
  serverId,
  onAction,
  onDelete,
  actionMsg,
}: {
  serverId: string;
  onAction: (action: string) => void;
  onDelete: () => void;
  actionMsg?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: { label: string; action?: string; href?: string; danger?: boolean }[] = [
    { label: "Edit server", href: `/admin/servers/${serverId}/edit` },
    { label: "Push config", action: "apply_config" },
    { label: "Reload nginx", action: "nginx_reload" },
    { label: "Clear cache", action: "clear_cache" },
    { label: "Issue SSL (certbot)", href: `/admin/servers/${serverId}/edit` },
    { label: "Reboot server", action: "reboot_server" },
    { label: "Delete", danger: true },
  ];

  const updatePosition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return;
    const menuW = menuRef.current?.offsetWidth ?? 200;
    const menuH = menuRef.current?.offsetHeight ?? 280;
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

  function toggle() {
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
          style={{ top: pos.top, left: pos.left, minWidth: "12.5rem" }}
          role="menu"
        >
          <div className="xui-lines-action-menu-head">Server actions</div>
          {items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="xui-lines-action-menu-item"
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                {item.label}
              </Link>
            ) : item.danger ? (
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
            ) : (
              <button
                key={item.label}
                type="button"
                className="xui-lines-action-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (item.action) onAction(item.action);
                }}
              >
                {item.label}
              </button>
            )
          )}
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
        style={{ padding: "0.35rem 0.5rem" }}
        aria-label="Server actions"
        aria-expanded={open}
        onClick={toggle}
      >
        <MoreVertical size={16} />
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
