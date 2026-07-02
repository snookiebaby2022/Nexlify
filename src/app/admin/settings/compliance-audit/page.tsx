import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function ComplianceAuditSettingsPage() {
  return (
    <SettingsPanelForm
      group="compliance-audit"
      title="Compliance & Audit"
      description="Audit log retention, GDPR exports, ISO compliance tooling."
      sections={[
        {
          title: "Audit",
          fields: [
            { key: "enabled", label: "Enable compliance audit tools", type: "yesno" },
            { key: "auditLogRetentionDays", label: "Audit log retention (days)", type: "number" },
            {
              key: "exportFormat",
              label: "Export format",
              type: "select",
              options: [
                { value: "json", label: "JSON" },
                { value: "csv", label: "CSV" },
              ],
            },
            { key: "gdprDataExportEnabled", label: "GDPR data export for lines", type: "yesno" },
            { key: "isoComplianceNotes", label: "Operator notes", type: "textarea", colSpan: 3 },
          ],
        },
      ]}
    />
  );
}
