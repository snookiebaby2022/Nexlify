"use client";

import { useEffect, useRef, useState } from "react";

export type DashboardStreamData = {
  timestamp: string;
  onlineConnections: number;
  onlineUsers: number;
  onlineStreams: number;
  totalActiveLines: number;
  networkInMbps: number;
  networkOutMbps: number;
  connections: {
    id: string;
    line: string;
    stream: string;
    startedAt: string;
    lastSeenAt: string;
  }[];
};

export function useDashboardStream(enabled = true) {
  const [data, setData] = useState<DashboardStreamData | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const es = new EventSource("/api/admin/dashboard-stream");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as DashboardStreamData;
        setData(parsed);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [enabled]);

  return { data, connected };
}
