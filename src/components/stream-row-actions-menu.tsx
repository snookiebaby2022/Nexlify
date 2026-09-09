"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { computePortalMenuPosition } from "@/lib/portal-menu-position";
import { adminToast } from "@/lib/admin-toast";
import { notifyStreamHealthChanged } from "@/lib/stream-health-events";
import { RestartStreamModal } from "@/components/restart-stream-modal";

type StreamType = "LIVE" | "MOVIE" | "SERIES";

export function StreamRowActionsMenu({
  streamId,
  streamType,
  streamName,
  streamUrl,
  isActive,
  serverId,
  onRefresh,
  onDelete,
  editHref,
  onEdit,
}: {
  streamId: string;
  streamType?: StreamType;
  streamName?: string;
  streamUrl?: string | null;
  isActive: boolean;
  serverId?: string | null;
  onRefresh: () => void;
  onDelete: () => void;
  editHref?: string;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [flipped, setFlipped] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function killViewers() {
    if (!confirm("Kick all viewers watching this stream?")) return;
    try {
      const res = await fetch(`/api/admin/streams/${streamId}/connections`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) adminToast(`Kicked ${data.killed ?? 0} connection(s)`, "success");
      else adminToast(data.error ?? "Failed to kick viewers", "error");
    } catch {
      adminToast("Network error while kicking viewers", "error");
    }
  }

  async function toggleActive() {
    try {
      const res = await fetch("/api/admin/streams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: streamId, isActive: !isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        adminToast(data.error ?? "Failed to update stream", "error");
        return;
      }
      adminToast(isActive ? "Stream disabled" : "Stream enabled", "success");
      onRefresh();
    } catch {
      adminToast("Network error while updating stream", "error");
    }
  }

  async function probeStream() {
    setOpen(false);
    adminToast("Probing source…", "info", 2500);
    try {
      const res = await fetch("/api/admin/streams/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, fast: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        adminToast(data.error ?? "Probe failed", "error");
        return;
      }
      const ok = data.probe?.status === "online" || data.probe?.status === "degraded";
      adminToast(
        ok
          ? `Source online${data.probe?.latencyMs != null ? ` (${data.probe.latencyMs} ms)` : ""}`
          : data.probe?.message ?? "Source offline",
        ok ? "success" : "error"
      );
      notifyStreamHealthChanged();
      onRefresh();
    } catch {
      adminToast("Network error while probing", "error");
    }
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

  function openRestart() {
    setOpen(false);
    if (!serverId) {
      adminToast("No streaming server assigned to this channel.", "error");
      return;
    }
    setRestartOpen(true);
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
              onClick={openRestart}
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
      {serverId ? (
        <RestartStreamModal
          open={restartOpen}
          streamId={streamId}
          serverId={serverId}
          streamName={streamName}
          currentUrl={streamUrl}
          onClose={() => setRestartOpen(false)}
          onDone={onRefresh}
        />
      ) : null}
    </div>
  );
}
