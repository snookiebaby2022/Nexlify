"use client";

import { X } from "lucide-react";
import { StreamProbePlayer } from "@/components/stream-probe-player";
import { RadioProbePlayer } from "@/components/radio-probe-player";

export function StreamPreviewModal({
  streamId,
  streamName,
  streamUrl,
  backupUrl,
  streamType,
  onClose,
}: {
  streamId: string;
  streamName: string;
  streamUrl: string;
  backupUrl?: string | null;
  streamType: string;
  onClose: () => void;
}) {
  const isRadio = streamType === "RADIO";
  const backup = String(backupUrl ?? "").trim();

  return (
    <div className="xui-modal-backdrop" onClick={onClose}>
      <div
        className="xui-modal-panel"
        style={{ maxWidth: "640px", width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="xui-modal-header">
          <h2 className="text-lg font-semibold">Preview — {streamName}</h2>
          <button type="button" className="xui-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="xui-modal-body space-y-4">
          {isRadio ? (
            <RadioProbePlayer
              playFirst
              streamId={streamId}
              streamUrl={streamUrl}
              name={streamName}
            />
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Primary source
                </p>
                <StreamProbePlayer
                  playFirst
                  streamId={streamId}
                  streamUrl={streamUrl}
                  name={streamName}
                />
              </div>
              {backup ? (
                <div className="space-y-1 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                    Backup source (failover)
                  </p>
                  <StreamProbePlayer compact streamUrl={backup} name={streamName + " (backup)"} />
                </div>
              ) : (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  No backup URL set — add one on the Sources tab to probe failover here.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
