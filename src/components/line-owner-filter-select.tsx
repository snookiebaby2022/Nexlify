"use client";

import { groupOwnersByRole, ownerRoleLabel, type LineOwnerOption } from "@/lib/line-owner-filter";

export function LineOwnerFilterSelect({
  value,
  onChange,
  panel,
  owners,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  panel: "admin" | "reseller";
  owners: LineOwnerOption[];
  className?: string;
}) {
  const grouped = groupOwnersByRole(owners);
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All owners</option>
      {panel === "admin" ? (
        <>
          <option value="role:ADMIN">Admins (including unassigned)</option>
          <option value="admin">Unassigned only</option>
          <option value="role:RESELLER">All resellers</option>
          <option value="role:SUB_RESELLER">All sub-resellers</option>
        </>
      ) : (
        <>
          <option value="mine">My lines</option>
          <option value="role:SUB_RESELLER">Sub-reseller lines</option>
        </>
      )}
      {grouped.admins.length > 0 ? (
        <optgroup label="Admins">
          {grouped.admins.map((o) => (
            <option key={o.id} value={o.id}>
              {o.username}
            </option>
          ))}
        </optgroup>
      ) : null}
      {grouped.resellers.length > 0 ? (
        <optgroup label="Resellers">
          {grouped.resellers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.username}
            </option>
          ))}
        </optgroup>
      ) : null}
      {grouped.subResellers.length > 0 ? (
        <optgroup label="Sub-resellers">
          {grouped.subResellers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.username}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

export function LineOwnerOptions({ owners }: { owners: LineOwnerOption[] }) {
  const grouped = groupOwnersByRole(owners);
  return (
    <>
      {grouped.resellers.length > 0 ? (
        <optgroup label="Resellers">
          {grouped.resellers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.username} ({ownerRoleLabel(o.role)})
            </option>
          ))}
        </optgroup>
      ) : null}
      {grouped.subResellers.length > 0 ? (
        <optgroup label="Sub-resellers">
          {grouped.subResellers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.username} ({ownerRoleLabel(o.role)})
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
