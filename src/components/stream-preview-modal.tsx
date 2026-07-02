"use client";

import { X } from "lucide-react";
import { StreamProbePlayer } from "@/components/stream-probe-player";
import { RadioProbePlayer } from "@/components/radio-probe-player";

export function StreamPreviewModal({
  streamId,
  streamName,
  streamUrl,
  streamType,
  onClose,
}: {
  streamId: string;
  streamName: string;
  streamUrl: string;
  streamType: string;
  onClose: () => void;
}) {
  const isRadio = streamType === "RADIO";

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
        <div className="xui-modal-body">
          {isRadio ? (
            <RadioProbePlayer
              playFirst
              streamId={streamId}
              streamUrl={streamUrl}
              name={streamName}
            />
          ) : (
            <StreamProbePlayer
              playFirst
              streamId={streamId}
              streamUrl={streamUrl}
              name={streamName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
