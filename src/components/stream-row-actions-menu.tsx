"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { restartStreamOnServer } from "@/lib/restart-stream";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";

type StreamType = "LIVE" | "MOVIE" | "SERIES";

export function StreamRowActionsMenu({
  streamId,
  streamType,
  isActive,
  serverId,
  onRefresh,
  onDelete,
  editHref,
  onEdit,
}: {
  streamId: string;
  streamType?: StreamType;
  isActive: boolean;
  serverId?: string | null;
  onRefresh: () => void;
  onDelete: () => void;
  editHref?: string;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function killViewers() {
    if (!confirm("Kick all viewers watching this stream?")) return;
    const res = await fetch(`/api/admin/streams/${streamId}/connections`, { method: "DELETE" });
    const data = await res.json();
    alert(res.ok ? `Kicked ${data.killed ?? 0} connection(s)` : (data.error ?? "Failed"));
  }

  async function toggleActive() {
    await fetch("/api/admin/streams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: streamId, isActive: !isActive }),
    });
    onRefresh();
  }

  async function probeStream() {
    setOpen(false);
    const res = await fetch("/api/admin/streams/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, fast: false }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Probe failed");
      return;
    }
    const ok = data.probe?.status === "online" || data.probe?.status === "degraded";
    alert(
      ok
        ? `Source online${data.probe?.latencyMs != null ? ` (${data.probe.latencyMs} ms)` : ""}`
        : data.probe?.message ?? "Source offline"
    );
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

  async function restartStream() {
    setOpen(false);
    if (!serverId) {
      alert("No streaming server assigned to this channel.");
      return;
    }
    if (!confirm("Restart this stream on the assigned server? Viewers will reconnect.")) return;
    const err = await restartStreamOnServer(serverId, streamId);
    if (err) alert(err);
    else onRefresh();
  }

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
          {onEdit ? (
            <button
              type="button"
              className="xui-lines-action-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            >
              Edit stream
            </button>
          ) : (
            <Link href={editHref ?? `/admin/content/streams?edit=${streamId}`} className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
              Edit stream
            </Link>
          )}
          <Link href="/admin/streams/logs" className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
            View logs
          </Link>
          <Link href="/admin/content/streams?status=offline" className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
            Failed probes
          </Link>
          {streamType === "LIVE" && (
            <button
              type="button"
              className="xui-lines-action-menu-item"
              role="menuitem"
              onClick={() => void probeStream()}
            >
              Probe source
            </button>
          )}
          {streamType === "LIVE" && (
            <button
              type="button"
              className="xui-lines-action-menu-item"
              role="menuitem"
              onClick={() => void restartStream()}
            >
              Restart stream
            </button>
          )}
          {streamType === "SERIES" && (
            <Link href={episodesHref} className="xui-lines-action-menu-item" onClick={() => setOpen(false)} role="menuitem">
              Manage episodes
            </Link>
          )}
          {streamType === "LIVE" && (
            <button
              type="button"
              className="xui-lines-action-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void killViewers();
              }}
            >
              Kill all viewers
            </button>
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
