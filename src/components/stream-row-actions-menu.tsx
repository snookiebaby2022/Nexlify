"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

type StreamType = "LIVE" | "MOVIE" | "SERIES";

export function StreamRowActionsMenu({
  streamId,
  streamType,
  isActive,
  onRefresh,
  onDelete,
}: {
  streamId: string;
  streamType?: StreamType;
  isActive: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function toggleActive() {
    await fetch("/api/admin/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: streamId, isActive: !isActive }),
    });
    onRefresh();
  }

  const updatePosition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
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
    const fn = () => updatePosition();
    window.addEventListener("scroll", fn, true);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("scroll", fn, true);
      window.removeEventListener("resize", fn);
    };
  }, [open, updatePosition]);

  const episodesHref =
    streamType === "SERIES" ? `/admin/content/episodes?seriesId=${streamId}` : "/admin/content/episodes/add";

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <button type="button" className="xui-lines-action-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
        <div
          ref={menuRef}
          className={`xui-lines-action-menu xui-lines-action-menu--portal ${flipped ? "xui-lines-action-menu--flip" : ""}`}
          style={{ top: pos.top, left: pos.left, minWidth: "12rem" }}
          role="menu"
        >
          <div className="xui-lines-action-menu-head">Stream actions</div>
          <Link href={`/admin/servers/streams?edit=${streamId}`} className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
            Edit stream
          </Link>
          <Link href="/admin/streams/logs" className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
            View logs
          </Link>
          <Link href="/admin/stream_health" className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
            Stream health
          </Link>
          {streamType === "SERIES" && (
            <Link href={episodesHref} className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
              Manage episodes
            </Link>
          )}
          <button
            type="button"
            className="xui-lines-action-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void toggleActive();
            }}
          >
            {isActive ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            className="xui-lines-action-menu-item xui-lines-action-menu-item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
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
        aria-label="Stream actions"
        aria-expanded={open}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((o) => !o);
        }}
      >
        <MoreVertical size={16} />
      </button>
      {menu}
    </div>
  );
}
