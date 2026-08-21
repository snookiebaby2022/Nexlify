"use client";

import { useEffect, useState } from "react";

type DvrRow = {
  id: string;
  title: string;
  channelName: string;
  status: string;
  startTime: string;
  durationSec: number;
  fileSize: string;
  stream?: { name: string };
};

export default function DvrLibraryPage() {
  const [rows, setRows] = useState<DvrRow[]>([]);
  const [storage, setStorage] = useState<{ usedGb: number; limitGb: number; percentUsed: number } | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const [lib, st] = await Promise.all([
        fetch("/api/admin/dvr?action=library"),
        fetch("/api/admin/dvr?action=storage"),
      ]);
      if (lib.ok) setRows(await lib.json());
      if (st.ok) setStorage(await st.json());
    })();
  }, []);

  return (
    <div className="xui-page">
      <h1 className="xui-page-title">DVR Library</h1>
      <p className="xui-muted">Server-side recordings stored on disk with replay URLs.</p>
      {storage ? (
        <p style={{ marginTop: 12 }}>
          Storage: {storage.usedGb} GB / {storage.limitGb} GB ({storage.percentUsed}%)
        </p>
      ) : null}
      <div className="xui-card" style={{ marginTop: 16 }}>
        <table className="xui-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{r.stream?.name ?? r.channelName}</td>
                <td>{r.status}</td>
                <td>{new Date(r.startTime).toLocaleString()}</td>
                <td>{Math.round(r.durationSec / 60)} min</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No recordings yet. Schedule from Catch-up/DVR settings or MAG PVR.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
