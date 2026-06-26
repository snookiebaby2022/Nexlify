"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

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
  const btnRef = useRef<HTMLButtonElement>(null);

  const items: { label: string; action?: string; href?: string; danger?: boolean }[] = [
    { label: "Edit server", href: `/admin/servers/${serverId}/edit` },
    { label: "Push config", action: "apply_config" },
    { label: "Reload nginx", action: "nginx_reload" },
    { label: "Clear cache", action: "clear_cache" },
    { label: "Issue SSL (certbot)", href: `/admin/servers/${serverId}/edit` },
    { label: "Reboot server", action: "reboot_server" },
    { label: "Delete", danger: true },
  ];

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const menuW = 200;
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8)),
      });
    }
    setOpen((o) => !o);
  }

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} aria-hidden />
        <div
          className="fixed z-[210] min-w-[200px] rounded-lg border shadow-lg py-1 text-sm"
          style={{
            top: pos.top,
            left: pos.left,
            borderColor: "var(--border)",
            background: "var(--bg-card)",
          }}
          role="menu"
        >
          {items.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="block px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => setOpen(false)}
                role="menuitem"
              >
                {item.label}
              </Link>
            ) : item.danger ? (
              <button
                key={item.label}
                type="button"
                className="w-full text-left px-3 py-2 cursor-pointer hover:bg-black/5"
                style={{ color: "var(--danger)" }}
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
                className="w-full text-left px-3 py-2 cursor-pointer hover:bg-black/5"
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
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        className="p-1.5 rounded border cursor-pointer hover:opacity-80"
        style={{ borderColor: "var(--border)" }}
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
