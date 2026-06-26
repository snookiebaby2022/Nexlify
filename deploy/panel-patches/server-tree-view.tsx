"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";
import {
  buildServerTreeGroups,
  serverHealthColor,
  type ServerTreeNode,
} from "@/lib/server-tree";

export function ServerTreeView({
  servers,
  selectedIds,
  onToggleSelect,
  onToggleGroup,
}: {
  servers: ServerTreeNode[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleGroup?: (ids: string[]) => void;
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
      {groups.map((group) => {
        const open = expanded.has(group.id);
        const ids = group.servers.map((s) => s.id);
        const groupAll = selectedIds ? ids.every((id) => selectedIds.has(id)) : false;
        const groupSome = selectedIds ? ids.some((id) => selectedIds.has(id)) : false;

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
                className="flex-1 text-left font-semibold cursor-pointer"
                onClick={() => toggleExpand(group.id)}
              >
                {group.label}
                <span className="text-xs ml-2 font-normal opacity-70">({group.servers.length})</span>
              </button>
            </div>

            {open &&
              group.servers.map((s) => {
                const online = s.healthStatus === "online" || s.healthStatus === "healthy";
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 pl-10 pr-4 py-2 border-t hover:bg-white/[0.03]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {selectedIds && onToggleSelect && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => onToggleSelect(s.id)}
                        className="cursor-pointer shrink-0"
                      />
                    )}
                    <Server size={14} className="shrink-0" style={{ color: serverHealthColor(s.healthStatus) }} />
                    <div className="flex-1 min-w-0">
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
                    <span className="text-xs shrink-0 w-14 text-right" style={{ color: "var(--muted)" }}>
                      {s._count?.streams ?? 0} ch
                    </span>
                    <span
                      className={`text-xs shrink-0 w-10 text-right ${s.isActive ? "" : "opacity-50"}`}
                      style={{ color: s.isActive ? "#4ade80" : "var(--muted)" }}
                    >
                      {s.isActive ? "On" : "Off"}
                    </span>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
