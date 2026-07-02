"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

export function BouquetRowActionsMenu({
  bouquetId,
  isActive,
  busy,
  onToggleActive,
  onDuplicate,
  onDelete,
}: {
  bouquetId: string;
  isActive: boolean;
  busy: boolean;
  onToggleActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuW = menuRef.current?.offsetWidth ?? 216;
    const menuH = menuRef.current?.offsetHeight ?? 160;
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
    const fn = () => updatePosition();
    window.addEventListener("scroll", fn, true);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("scroll", fn, true);
      window.removeEventListener("resize", fn);
    };
  }, [open, updatePosition]);

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <button type="button" className="xui-lines-action-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
        <div
          ref={menuRef}
          className={`xui-lines-action-menu xui-lines-action-menu--portal ${flipped ? "xui-lines-action-menu--flip" : ""}`}
          style={{ top: pos.top, left: pos.left, minWidth: "13.5rem" }}
          role="menu"
        >
          <div className="xui-lines-action-menu-head">Bouquet actions</div>
          <Link
            href={`/admin/bouquets/${bouquetId}`}
            className="xui-lines-action-menu-item"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            <Pencil size={15} className="opacity-70" />
            Edit bouquet
          </Link>
          <button
            type="button"
            className="xui-lines-action-menu-item"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onToggleActive();
            }}
          >
            {isActive ? "Disable" : "Enable"}
          </button>
          <Link
            href={`/admin/lines?bouquet=${bouquetId}`}
            className="xui-lines-action-menu-item"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            View lines
          </Link>
          <Link
            href={`/admin/bouquets/${bouquetId}`}
            className="xui-lines-action-menu-item"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            <Eye size={15} className="opacity-70" />
            View streams
          </Link>
          <button
            type="button"
            className="xui-lines-action-menu-item"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onDuplicate();
            }}
          >
            <Copy size={15} className="opacity-70" />
            Duplicate bouquet
          </button>
          <button
            type="button"
            className="xui-lines-action-menu-item xui-lines-action-menu-item--danger"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={15} className="opacity-70" />
            Delete
          </button>
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
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((o) => !o);
        }}
      >
        <span>Actions</span>
        <ChevronDown size={14} className="xui-lines-action-chevron" aria-hidden />
      </button>
      {menu}
    </div>
  );
}
