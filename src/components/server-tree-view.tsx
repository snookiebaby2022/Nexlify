"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";
import {
  buildServerTreeGroups,
  serverHealthColor,
  type ServerTreeNode,
} from "@/lib/server-tree";
import { ServerActionsMenu } from "@/components/server-actions-menu";

export function ServerTreeView({
  servers,
  selectedIds,
  onToggleSelect,
  onToggleGroup,
  onServerAction,
  onServerDelete,
  actionMsgs,
}: {
  servers: ServerTreeNode[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleGroup?: (ids: string[]) => void;
  onServerAction?: (serverId: string, action: string) => void;
  onServerDelete?: (serverId: string) => void;
  actionMsgs?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["__direct__"]));
  const groups = useMemo(() => buildServerTreeGroups(servers), [servers]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!servers.length) {
    return (
      <p className="text-sm p-4" style={{ color: "var(--muted)" }}>
        No streaming servers yet.{" "}
        <Link href="/admin/servers/add" className="underline" style={{ color: "var(--accent)" }}>
          Add a server
        </Link>
      </p>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden text-sm"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div
        className="hidden sm:grid items-center gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide border-b"
        style={{
          borderColor: "var(--border)",
          color: "var(--muted)",
          gridTemplateColumns: onServerAction
            ? "1.5rem 1.5rem minmax(0,1fr) 5rem 4rem 3rem 4rem"
            : "1.5rem 1.5rem minmax(0,1fr) 5rem 4rem 3rem",
        }}
      >
        <span />
        <span />
        <span>Server</span>
        <span>Health</span>
        <span className="text-right">Streams</span>
        <span className="text-right">Active</span>
        {onServerAction ? <span className="text-right">Actions</span> : null}
      </div>

      {groups.map((group) => {
        const open = expanded.has(group.id);
        const ids = group.servers.map((s) => s.id);
        const groupAll = selectedIds ? ids.every((id) => selectedIds.has(id)) : false;
        const groupSome = selectedIds ? ids.some((id) => selectedIds.has(id)) : false;
        const onlineCount = group.servers.filter(
          (s) => s.healthStatus === "online" || s.healthStatus === "healthy"
        ).length;

        return (
          <div key={group.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{
                background: "linear-gradient(90deg, rgba(79,70,229,0.12) 0%, rgba(59,130,246,0.08) 100%)",
              }}
            >
              <button
                type="button"
                className="p-0.5 cursor-pointer shrink-0"
                onClick={() => toggleExpand(group.id)}
                aria-label={open ? "Collapse" : "Expand"}
              >
                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {selectedIds && onToggleGroup && (
                <input
                  type="checkbox"
                  checked={groupAll}
                  ref={(el) => {
                    if (el) el.indeterminate = groupSome && !groupAll;
                  }}
                  onChange={() => onToggleGroup(ids)}
                  className="cursor-pointer"
                />
              )}
              <button
                type="button"
                className="flex-1 text-left font-semibold cursor-pointer min-w-0"
                onClick={() => toggleExpand(group.id)}
              >
                {group.label}
                <span className="text-xs ml-2 font-normal opacity-70">
                  ({group.servers.length} · {onlineCount} online)
                </span>
              </button>
            </div>

            {open &&
              group.servers.map((s) => {
                const online = s.healthStatus === "online" || s.healthStatus === "healthy";
                return (
                  <div
                    key={s.id}
                    className="border-t hover:bg-white/[0.03] px-4 py-3 sm:py-2.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-start gap-3 sm:hidden">
                      {selectedIds && onToggleSelect ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => onToggleSelect(s.id)}
                          className="cursor-pointer shrink-0 mt-1"
                        />
                      ) : null}
                      <Server size={14} className="shrink-0 mt-1" style={{ color: serverHealthColor(s.healthStatus) }} />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <Link
                            href={`/admin/servers/${s.id}/edit`}
                            className="font-medium hover:underline truncate block"
                            style={{ color: "var(--accent)" }}
                          >
                            {s.name}
                          </Link>
                          {s.host && (
                            <span className="text-xs block truncate" style={{ color: "var(--muted)" }}>
                              {s.host}
                              {s.port ? `:${s.port}` : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
                            style={{
                              background: online ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
                              color: serverHealthColor(s.healthStatus),
                            }}
                          >
                            {s.healthStatus ?? "unknown"}
                          </span>
                          <span style={{ color: "var(--muted)" }}>{s._count?.streams ?? 0} streams</span>
                          <span style={{ color: s.isActive ? "#4ade80" : "var(--muted)" }}>
                            {s.isActive ? "Active" : "Off"}
                          </span>
                        </div>
                        {onServerAction && onServerDelete ? (
                          <ServerActionsMenu
                            serverId={s.id}
                            onAction={(action) => onServerAction(s.id, action)}
                            onDelete={() => onServerDelete(s.id)}
                            actionMsg={actionMsgs?.[s.id]}
                          />
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="hidden sm:grid items-center gap-3 pl-2"
                      style={{
                        gridTemplateColumns: onServerAction
                          ? "1.5rem 1.5rem minmax(0,1fr) 5rem 4rem 3rem 4rem"
                          : "1.5rem 1.5rem minmax(0,1fr) 5rem 4rem 3rem",
                      }}
                    >
                      <span />
                      {selectedIds && onToggleSelect ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => onToggleSelect(s.id)}
                          className="cursor-pointer shrink-0"
                        />
                      ) : (
                        <span />
                      )}
                      <Server size={14} className="shrink-0" style={{ color: serverHealthColor(s.healthStatus) }} />
                      <div className="min-w-0">
                        <Link
                          href={`/admin/servers/${s.id}/edit`}
                          className="font-medium hover:underline truncate block"
                          style={{ color: "var(--accent)" }}
                        >
                          {s.name}
                        </Link>
                        {s.host && (
                          <span className="text-xs block truncate" style={{ color: "var(--muted)" }}>
                            {s.host}
                            {s.port ? `:${s.port}` : ""}
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: online ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
                          color: serverHealthColor(s.healthStatus),
                        }}
                      >
                        {s.healthStatus ?? "unknown"}
                      </span>
                      <span className="text-xs shrink-0 text-right" style={{ color: "var(--muted)" }}>
                        {s._count?.streams ?? 0}
                      </span>
                      <span
                        className={`text-xs shrink-0 text-right ${s.isActive ? "" : "opacity-50"}`}
                        style={{ color: s.isActive ? "#4ade80" : "var(--muted)" }}
                      >
                        {s.isActive ? "On" : "Off"}
                      </span>
                      {onServerAction && onServerDelete ? (
                        <div className="justify-self-end">
                          <ServerActionsMenu
                            serverId={s.id}
                            onAction={(action) => onServerAction(s.id, action)}
                            onDelete={() => onServerDelete(s.id)}
                            actionMsg={actionMsgs?.[s.id]}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
