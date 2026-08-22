"use client";

import { LineRenewModal } from "@/components/line-renew-modal";

/** @deprecated Use LineRenewModal directly — kept for MAG/Enigma pages. */
export function DeviceRenewModal(props: {
  open: boolean;
  lineId: string;
  lineUsername: string;
  expiresAt?: string | null;
  status?: string;
  onClose: () => void;
  onRenewed: () => void;
}) {
  if (!props.expiresAt) return null;
  return (
    <LineRenewModal
      open={props.open}
      lineId={props.lineId}
      lineUsername={props.lineUsername}
      expiresAt={props.expiresAt}
      status={props.status}
      onClose={props.onClose}
      onRenewed={() => props.onRenewed()}
    />
  );
}
