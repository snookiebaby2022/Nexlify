"use client";

import { CopyableCredential } from "@/components/copyable-credential";
import { linesApiRoot, type PanelKind } from "@/lib/panel-api";

export function LinePasswordCell({
  lineId,
  panel,
  className,
}: {
  lineId: string;
  panel: PanelKind;
  className?: string;
}) {
  return (
    <CopyableCredential
      value=""
      masked
      className={className}
      resolveValue={async () => {
        const r = await fetch(`${linesApiRoot(panel)}/${encodeURIComponent(lineId)}`, {
          credentials: "same-origin",
        });
        if (!r.ok) return "";
        const data = (await r.json()) as { line?: { password?: string } };
        return String(data.line?.password ?? "");
      }}
    />
  );
}
