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
    if (!enabled || typeof document === "undefined") {
      setConnected(false);
      return;
    }

    let es: EventSource | null = null;

    const connect = () => {
      if (document.visibilityState === "hidden") return;
      es?.close();
      es = new EventSource("/api/admin/dashboard-stream");
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
      };
    };

    const disconnect = () => {
      es?.close();
      es = null;
      eventSourceRef.current = null;
      setConnected(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        disconnect();
      } else {
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      disconnect();
    };
  }, [enabled]);

  return { data, connected };
}
