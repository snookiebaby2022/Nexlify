"use client";

import { Calendar, Globe, Tv } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

function truncateMiddle(value: string, max = 28) {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function LastWatchedCell({
  streamName,
  ip,
  watchedAt,
}: {
  streamName?: string | null;
  ip?: string | null;
  watchedAt?: string | null;
}) {
  if (!streamName && !watchedAt) {
    return <span className="xui-last-watched-empty">—</span>;
  }

  return (
    <div className="xui-last-watched">
      {streamName ? (
        <div className="xui-last-watched-row" title={streamName}>
          <Tv size={13} className="xui-last-watched-icon" aria-hidden />
          <span className="xui-last-watched-text">{truncateMiddle(streamName, 32)}</span>
        </div>
      ) : null}
      {ip ? (
        <div className="xui-last-watched-row" title={ip}>
          <Globe size={13} className="xui-last-watched-icon" aria-hidden />
          <span className="xui-last-watched-text xui-last-watched-ip">{truncateMiddle(ip, 34)}</span>
        </div>
      ) : null}
      {watchedAt ? (
        <div className="xui-last-watched-row" title={watchedAt}>
          <Calendar size={13} className="xui-last-watched-icon" aria-hidden />
          <span className="xui-last-watched-text xui-last-watched-time">{formatRelativeTime(watchedAt)}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ConnInfoCell({
  activeConnection,
}: {
  activeConnection?: {
    ip?: string | null;
    streamName?: string | null;
    userAgent?: string | null;
  } | null;
}) {
  if (!activeConnection?.ip && !activeConnection?.streamName) {
    return <span className="xui-last-watched-empty">—</span>;
  }

  return (
    <div className="xui-last-watched">
      {activeConnection.streamName ? (
        <div className="xui-last-watched-row" title={activeConnection.streamName}>
          <Tv size={13} className="xui-last-watched-icon" aria-hidden />
          <span className="xui-last-watched-text">{truncateMiddle(activeConnection.streamName, 28)}</span>
        </div>
      ) : null}
      {activeConnection.ip ? (
        <div className="xui-last-watched-row" title={activeConnection.ip}>
          <Globe size={13} className="xui-last-watched-icon" aria-hidden />
          <span className="xui-last-watched-text xui-last-watched-ip">{truncateMiddle(activeConnection.ip, 34)}</span>
        </div>
      ) : null}
    </div>
  );
}
