"use client";

import Link from "next/link";
import { FormPageShell } from "@/components/form-page-shell";
import { PanelLicenseKeyForm } from "@/components/panel-license-key-form";
import { usePanelLicenseStatus, PanelLicenseStatusCard } from "@/components/panel-license-status";

export default function LicenseAddPage() {
  const { status, load, onTrialOnly, isLicensed } = usePanelLicenseStatus();

  return (
    <FormPageShell title="Add License" manageHref="/admin/license/show" manageLabel="Show License">
      <div className="space-y-6 max-w-2xl">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Activate a new Nexlify license key from your vendor (starts with NXLF1.).
        </p>
        <PanelLicenseStatusCard status={status} isLicensed={isLicensed} onTrialOnly={onTrialOnly} />
        <PanelLicenseKeyForm
          submitLabel="Activate license"
          hint="First-time activation or replacing an expired trial."
          onSuccess={() => {
            load();
            window.location.assign("/admin/dashboard");
          }}
        />
        <Link href="/admin/license/renew" className="text-sm underline" style={{ color: "var(--accent)" }}>
          Already licensed? Renew instead →
        </Link>
      </div>
    </FormPageShell>
  );
}
