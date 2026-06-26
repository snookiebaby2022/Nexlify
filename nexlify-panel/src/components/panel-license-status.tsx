"use client";

import { useEffect, useState } from "react";

export type LicenseStatusView = {
  valid: boolean;
  licensed?: boolean;
  reason?: string;
  tier?: string;
  term?: string;
  termLabel?: string;
  expiresAt?: string;
  licensee?: string;
  licenseId?: string;
  trial?: boolean;
  trialEndsAt?: string;
  onlineRequired?: boolean;
};

export function usePanelLicenseStatus() {
  const [status, setStatus] = useState<LicenseStatusView | null>(null);
  const [terms, setTerms] = useState<{ id: string; label: string; days: number }[]>([]);

  function load() {
    fetch("/api/license/status")
      .then((r) => r.json())
      .then((d) => setStatus(d.status));
  }

  useEffect(() => {
    load();
    fetch("/api/license/terms")
      .then((r) => r.json())
      .then((d) => setTerms(d.terms ?? []));
  }, []);

  const onTrialOnly = Boolean(status?.valid && status.trial && !status.licensed);
  const isLicensed = Boolean(
    status?.licensed || (status?.valid && !status?.trial && status?.licensee)
  );

  return { status, terms, load, onTrialOnly, isLicensed };
}

export function PanelLicenseStatusCard({
  status,
  isLicensed,
  onTrialOnly,
}: {
  status: LicenseStatusView | null;
  isLicensed: boolean;
  onTrialOnly: boolean;
}) {
  if (!status) return null;

  return (
    <div
      className="rounded-lg border p-4 text-sm space-y-2"
      style={{
        borderColor: isLicensed ? "var(--accent)" : "var(--border)",
        background: "var(--bg-card)",
      }}
    >
      {isLicensed ? (
        <>
          <p className="font-medium" style={{ color: "var(--accent)" }}>
            Licensed (paid)
          </p>
          {(status.termLabel || status.term) && (
            <p>
              <strong>Plan:</strong> {status.termLabel ?? status.term}
            </p>
          )}
          {status.licensee && (
            <p>
              <strong>Licensed to:</strong> {status.licensee}
            </p>
          )}
          {status.expiresAt && (
            <p>
              <strong>Expires:</strong> {new Date(status.expiresAt).toLocaleString()}
            </p>
          )}
          {status.licenseId && (
            <p className="text-xs font-mono opacity-70">ID: {status.licenseId}</p>
          )}
        </>
      ) : onTrialOnly ? (
        <>
          <p>
            <strong>Status:</strong> Trial only
          </p>
          {status.trialEndsAt && (
            <p>
              <strong>Trial ends:</strong> {new Date(status.trialEndsAt).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            <strong>Status:</strong> {status.valid ? "Active" : "Inactive"}
          </p>
          {status.reason && <p style={{ color: "var(--danger, #b91c1c)" }}>{status.reason}</p>}
        </>
      )}
      {status.onlineRequired && !isLicensed && (
        <p className="text-xs opacity-60">Activation uses the Nexlify license server.</p>
      )}
    </div>
  );
}
