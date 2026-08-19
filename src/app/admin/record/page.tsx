import { SettingsPanelForm } from "@/components/settings-panel-form";
import Link from "next/link";

export default function RecordRulesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">DVR / Record rules</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Catch-up recordings are stored on disk and played via{" "}
        <code>/timeshift/user/pass/duration/start/id.ts</code> (Xtream/XUI). Enable catch-up
        globally here, then set archive days on each live stream.
      </p>
      <SettingsPanelForm
        group="catchup"
        title="Catch-up TV"
        description="Time-shifted TV recordings used by MAG and Smarters catch-up."
        sections={[
          {
            title: "Storage",
            fields: [
              { key: "catchupEnabled", label: "Enable catch-up TV", type: "yesno" },
              { key: "catchupDays", label: "Default duration (days)", type: "number", placeholder: "7" },
              { key: "catchupStoragePath", label: "Storage path", placeholder: "/var/catchup" },
            ],
          },
        ]}
      />
      <Link href="/admin/settings/catchup" className="text-sm" style={{ color: "var(--accent)" }}>
        Open full Catch-up TV settings →
      </Link>
    </div>
  );
}
