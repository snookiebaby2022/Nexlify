"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Server } from "lucide-react";
import {
  buildServerTreeGroups,
  isServerHealthOnline,
  serverHealthColor,
  type ServerTreeGroup,
  type ServerTreeNode,
} from "@/lib/server-tree";
import { formatCombinedCapacityGbps, formatHeadroom, normalizeServerPool } from "@/lib/server-pool";

type StreamServer = ServerTreeNode & { bandwidthMbps?: number | null };

type LoadRow = {
  id: string;
  bandwidthMbps?: number;
  capMbps?: number;
  headroomPct?: number;
  saturated?: boolean;
};

function healthLabel(status?: string, isActive?: boolean) {
  if (isActive === false) return "Disabled";
  if (isServerHealthOnline(status)) return "Online";
  if (status === "offline" || status === "down") return "Offline";
  if (status === "degraded") return "Degraded";
  return status ? status : "Unknown";
}

export function ServerTreePicker({
  selectedIds,
  onChange,
  label = "Streaming servers",
  embedded = false,
  variant = "default",
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  /** Hide outer label when parent provides XUI row label */
  embedded?: boolean;
  variant?: "default" | "xui";
}) {
  const [servers, setServers] = useState<StreamServer[]>([]);
  const [loadById, setLoadById] = useState<Record<string, LoadRow>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["__direct__"]));

  useEffect(() => {
    fetch("/api/admin/servers")
      .then((r) => r.json())
      .then((d) => setServers(d.servers ?? []));
    fetch("/api/admin/servers/load-balancer")
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d.servers) ? (d.servers as LoadRow[]) : [];
        setLoadById(Object.fromEntries(rows.map((row) => [row.id, row])));
      })
      .catch(() => {});
  }, []);

  const groups = useMemo(() => buildServerTreeGroups(servers), [servers]);
  const orderedIds = useMemo(() => normalizeServerPool(selectedIds), [selectedIds]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleServer(id: string) {
    if (orderedIds.includes(id)) {
      onChange(orderedIds.filter((x) => x !== id));
      return;
    }
    onChange([...orderedIds, id]);
  }

  function toggleGroup(group: { servers: { id: string }[] }) {
    const ids = group.servers.map((s) => s.id);
    const allOn = ids.every((id) => orderedIds.includes(id));
    if (allOn) {
      onChange(orderedIds.filter((id) => !ids.includes(id)));
      return;
    }
    const extra = ids.filter((id) => !orderedIds.includes(id));
    onChange([...orderedIds, ...extra]);
  }

  function move(id: string, dir: -1 | 1) {
    const idx = orderedIds.indexOf(id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= orderedIds.length) return;
    const next = [...orderedIds];
    const [row] = next.splice(idx, 1);
    next.splice(nextIdx, 0, row);
    onChange(next);
  }

  if (!servers.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No streaming servers configured. Add servers under Streaming Servers first.
      </p>
    );
  }

  const isXui = variant === "xui";
  const selectedCaps = orderedIds.map((id) => {
    const load = loadById[id];
    const server = servers.find((s) => s.id === id);
    return Number(load?.capMbps || server?.bandwidthMbps || 0);
  });
  const combined = formatCombinedCapacityGbps(selectedCaps);

  return (
    <div className="space-y-2 w-full">
      {!embedded ? (
        <div className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          {label}
        </div>
      ) : null}
      <div
        className={`xui-server-table-wrap rounded-lg border overflow-hidden ${
          isXui ? "xui-server-tree-panel" : ""
        }`}
        style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        <table className="xui-server-pick-table">
          <thead>
            <tr>
              <th className="xui-server-pick-check" />
              <th className="xui-server-pick-pri">#</th>
              <th>Server</th>
              <th>Address</th>
              <th>Status</th>
              <th>Bandwidth</th>
              <th className="text-right">Streams</th>
              <th className="xui-server-pick-move" />
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const open = expanded.has(group.id);
              const groupAll = group.servers.every((s) => orderedIds.includes(s.id));
              const groupSome = group.servers.some((s) => orderedIds.includes(s.id));
              const online = group.servers.filter((s) => isServerHealthOnline(s.healthStatus)).length;
              return (
                <GroupRows
                  key={group.id}
                  group={group}
                  open={open}
                  groupAll={groupAll}
                  groupSome={groupSome}
                  online={online}
                  selectedIds={orderedIds}
                  loadById={loadById}
                  onToggleExpand={() => toggleExpand(group.id)}
                  onToggleGroup={() => toggleGroup(group)}
                  onToggleServer={toggleServer}
                  onMove={move}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {orderedIds.length
          ? `${orderedIds.length} selected · ${combined} combined viewer capacity (not bonded). First in order is primary; use arrows for overflow / failover.`
          : "None selected — load balancing picks an online server with headroom when viewers connect."}
      </p>
    </div>
  );
}

function GroupRows({
  group,
  open,
  groupAll,
  groupSome,
  online,
  selectedIds,
  loadById,
  onToggleExpand,
  onToggleGroup,
  onToggleServer,
  onMove,
}: {
  group: ServerTreeGroup;
  open: boolean;
  groupAll: boolean;
  groupSome: boolean;
  online: number;
  selectedIds: string[];
  loadById: Record<string, LoadRow>;
  onToggleExpand: () => void;
  onToggleGroup: () => void;
  onToggleServer: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <>
      <tr className="xui-server-pick-group">
        <td>
          <input
            type="checkbox"
            checked={groupAll}
            ref={(el) => {
              if (el) el.indeterminate = groupSome && !groupAll;
            }}
            onChange={onToggleGroup}
            className="cursor-pointer"
            aria-label={`Select ${group.label}`}
          />
        </td>
        <td colSpan={7}>
          <button type="button" className="xui-server-pick-group-btn" onClick={onToggleExpand}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>
              {group.label}{" "}
              <span className="opacity-60">
                ({online}/{group.servers.length} online)
              </span>
            </span>
          </button>
        </td>
      </tr>
      {open
        ? group.servers.map((s) => {
            const selected = selectedIds.includes(s.id);
            const priority = selected ? selectedIds.indexOf(s.id) + 1 : 0;
            const addr = s.host ? (s.port ? `${s.host}:${s.port}` : s.host) : "—";
            const status = healthLabel(s.healthStatus, s.isActive);
            const load = loadById[s.id];
            const used = Number(load?.bandwidthMbps ?? 0);
            const cap = Number(load?.capMbps || s.bandwidthMbps || 0);
            const head = Number(load?.headroomPct ?? (cap > 0 ? 100 : 0));
            return (
              <tr
                key={s.id}
                className={`xui-server-pick-row${selected ? " is-selected" : ""}`}
                onClick={() => onToggleServer(s.id)}
              >
                <td className="xui-server-pick-check">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleServer(s.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                  />
                </td>
                <td className="xui-server-pick-pri">
                  {selected ? (
                    <span className={`xui-server-pick-badge${priority === 1 ? " is-primary" : ""}`}>
                      {priority === 1 ? "P" : priority}
                    </span>
                  ) : (
                    <span className="opacity-30">—</span>
                  )}
                </td>
                <td>
                  <span className="xui-server-pick-name">
                    <Server size={15} className="shrink-0" style={{ color: "#4ade80" }} />
                    {s.name}
                    {priority === 1 ? <span className="xui-server-pick-primary-label">primary</span> : null}
                  </span>
                </td>
                <td className="xui-server-pick-addr">{addr}</td>
                <td>
                  <span
                    className="xui-server-pick-status"
                    style={{ color: serverHealthColor(s.isActive === false ? "offline" : s.healthStatus) }}
                  >
                    {status}
                    {load?.saturated ? " · sat" : ""}
                  </span>
                </td>
                <td className="xui-server-pick-bw tabular-nums">{formatHeadroom(used, cap, head)}</td>
                <td className="text-right tabular-nums">{s._count?.streams ?? "—"}</td>
                <td className="xui-server-pick-move">
                  {selected ? (
                    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="xui-server-pick-arrow"
                        disabled={priority <= 1}
                        onClick={() => onMove(s.id, -1)}
                        aria-label="Move up (higher priority)"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="xui-server-pick-arrow"
                        disabled={priority >= selectedIds.length}
                        onClick={() => onMove(s.id, 1)}
                        aria-label="Move down (lower priority)"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}
