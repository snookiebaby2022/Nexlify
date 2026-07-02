"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";
import { buildServerTreeGroups, type ServerTreeNode } from "@/lib/server-tree";

type StreamServer = ServerTreeNode & { isActive: boolean };

export function ServerTreePicker({
  selectedIds,
  onChange,
  label = "Streaming servers",
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const [servers, setServers] = useState<StreamServer[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["__direct__"]));

  useEffect(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
  }, []);

  const groups = useMemo(() => buildServerTreeGroups(servers), [servers]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleServer(id: string) {
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(Array.from(set));
  }

  function toggleGroup(group: { servers: { id: string }[] }) {
    const ids = group.servers.map((s) => s.id);
    const allOn = ids.every((id) => selectedIds.includes(id));
    const set = new Set(selectedIds);
    if (allOn) ids.forEach((id) => set.delete(id));
    else ids.forEach((id) => set.add(id));
    onChange(Array.from(set));
  }

  if (!servers.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No streaming servers configured. Add servers under Streaming Servers first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="rounded-lg border overflow-hidden text-sm max-h-[220px] overflow-y-auto"
        style={{ borderColor: "var(--border)", background: "rgba(0,0,0,0.15)" }}
      >
        {groups.map((group) => {
          const open = expanded.has(group.id);
          const groupAll = group.servers.every((s) => selectedIds.includes(s.id));
          const groupSome = group.servers.some((s) => selectedIds.includes(s.id));
          return (
            <div key={group.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5"
                style={{ background: groupSome ? "rgba(0,192,239,0.08)" : "transparent" }}
              >
                <button
                  type="button"
                  className="p-0.5 cursor-pointer shrink-0"
                  onClick={() => toggleExpand(group.id)}
                  aria-label={open ? "Collapse" : "Expand"}
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <input
                  type="checkbox"
                  checked={groupAll}
                  ref={(el) => {
                    if (el) el.indeterminate = groupSome && !groupAll;
                  }}
                  onChange={() => toggleGroup(group)}
                  className="cursor-pointer"
                />
                <button
                  type="button"
                  className="flex-1 text-left font-medium cursor-pointer"
                  onClick={() => toggleExpand(group.id)}
                >
                  {group.label}
                  <span className="text-xs ml-1 opacity-60">({group.servers.length})</span>
                </button>
              </div>
              {open &&
                group.servers.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 pl-9 pr-3 py-1.5 cursor-pointer hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleServer(s.id)}
                      className="cursor-pointer"
                    />
                    <Server size={12} className="shrink-0 opacity-70" style={{ color: "#4ade80" }} />
                    <span className={s.isActive ? "" : "opacity-50"}>{s.name}</span>
                  </label>
                ))}
            </div>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {selectedIds.length} selected · first server is used as primary on save
      </p>
    </div>
  );
}
