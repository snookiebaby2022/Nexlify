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
          Welcome — paste your Nexlify license key below (starts with NXLF1.). You can copy it from{" "}
          <a href="https://nexlify.live/dashboard" className="underline" style={{ color: "var(--accent)" }}>
            My licenses
          </a>{" "}
          on nexlify.live after purchase.
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
