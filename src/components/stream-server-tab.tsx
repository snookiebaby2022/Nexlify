"use client";

import { Info } from "lucide-react";
import { ServerTreePicker } from "@/components/server-tree-picker";
import { formInputStyle, formSelectClass } from "@/components/form-page-shell";

function XuiYesNo({
  value,
  onChange,
  name,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" name={name} checked={value} onChange={() => onChange(true)} />
        Yes
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" name={name} checked={!value} onChange={() => onChange(false)} />
        No
      </label>
    </div>
  );
}

function XuiRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="xui-vod-info-row">
      <div className="xui-vod-info-label">
        {label}
        {hint ? (
          <span title={hint} className="inline-flex ml-1 align-middle opacity-70">
            <Info size={13} />
          </span>
        ) : null}
      </div>
      <div className="xui-vod-info-field">{children}</div>
    </div>
  );
}

export type StreamServerTabProps = {
  streamType: string;
  serverIds: string[];
  onServerIdsChange: (ids: string[]) => void;
  vodMode?: string;
  onVodModeChange?: (mode: string) => void;
  transcodeProfile: string;
  onTranscodeProfileChange: (profile: string) => void;
  directSource?: boolean;
  onDirectSourceChange?: (v: boolean) => void;
  autoRestart?: boolean;
  onAutoRestartChange?: (v: boolean) => void;
  useProvider?: boolean;
};

export function StreamServerTab({
  streamType,
  serverIds,
  onServerIdsChange,
  vodMode = "LIVE",
  onVodModeChange,
  transcodeProfile,
  onTranscodeProfileChange,
  directSource = false,
  onDirectSourceChange,
  autoRestart = true,
  onAutoRestartChange,
  useProvider = false,
}: StreamServerTabProps) {
  const isLive = streamType === "LIVE";

  return (
    <div className="xui-vod-info-form xui-stream-server-tab">
      <XuiRow
        label="Streaming servers"
        hint="Select one or more servers. The first selected server is the primary assignment."
      >
        <ServerTreePicker
          embedded
          variant="xui"
          selectedIds={serverIds}
          onChange={onServerIdsChange}
        />
        {useProvider ? (
          <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            Hosted streams play from the provider URL. Assign a server only when you need local
            transcode or agent-side processing on a specific node.
          </p>
        ) : null}
      </XuiRow>

      {isLive && onVodModeChange ? (
        <XuiRow label="Stream mode" hint="On demand starts ffmpeg when the first viewer connects.">
          <select
            className={formSelectClass}
            style={formInputStyle}
            value={vodMode}
            onChange={(e) => onVodModeChange(e.target.value)}
          >
            <option value="LIVE">24/7 (always on)</option>
            <option value="ON_DEMAND">On demand</option>
            <option value="CATCHUP">Timeshift / catch-up</option>
          </select>
        </XuiRow>
      ) : null}

      <XuiRow label="Transcode profile" hint="Without transcode relays the source when codecs are compatible.">
        <select
          className={formSelectClass}
          style={formInputStyle}
          value={transcodeProfile}
          onChange={(e) => onTranscodeProfileChange(e.target.value)}
        >
          <option value="none">Without transcode</option>
          <option value="veryfast">Very fast</option>
          <option value="fast">Fast</option>
          <option value="medium">Medium</option>
          <option value="slow">Slow</option>
        </select>
      </XuiRow>

      {isLive && onDirectSourceChange ? (
        <XuiRow
          label="Direct source"
          hint="When enabled, viewers receive the upstream URL directly without panel restream where supported."
        >
          <XuiYesNo name="direct-source" value={directSource} onChange={onDirectSourceChange} />
        </XuiRow>
      ) : null}

      {isLive && onAutoRestartChange ? (
        <XuiRow label="Auto restart" hint="Restart ffmpeg on the stream server when the probe fails.">
          <XuiYesNo name="auto-restart" value={autoRestart} onChange={onAutoRestartChange} />
        </XuiRow>
      ) : null}

      {!serverIds.length ? (
        <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(0,192,239,0.1)", color: "#7dd3fc" }}>
          No server selected — load balancing will pick an online server with headroom when viewers connect.
        </p>
      ) : null}
    </div>
  );
}
