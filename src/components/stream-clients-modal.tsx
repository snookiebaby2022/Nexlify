"use client";

import { useEffect, useState } from "react";
import { Hammer, Fingerprint, X } from "lucide-react";
import { IpWithFlag } from "@/components/ip-with-flag";

type ClientRow = {
  id: string;
  line: string;
  server: string;
  ip: string | null;
  duration: string;
  output: string;
  restreamer: boolean;
};

export function StreamClientsModal({
  streamId,
  streamName,
  onClose,
}: {
  streamId: string;
  streamName: string;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/streams/${streamId}/connections`)
      .then((r) => r.json())
      .then((d) => setClients(d.clients ?? []))
      .finally(() => setLoading(false));
    const t = setInterval(() => {
      fetch(`/api/admin/streams/${streamId}/connections`)
        .then((r) => r.json())
        .then((d) => setClients(d.clients ?? []));
    }, 10000);
    return () => clearInterval(t);
  }, [streamId]);

  async function kick(id: string) {
    await fetch(`/api/admin/connections?id=${id}`, { method: "DELETE" });
    setClients((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="xui-modal-backdrop" onClick={onClose}>
      <div className="xui-modal-panel xui-clients-modal" onClick={(e) => e.stopPropagation()}>
        <div className="xui-modal-header">
          <h2 className="text-lg font-semibold">Clients — {streamName}</h2>
          <button type="button" className="xui-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="xui-modal-body">
          {loading ? (
            <p className="text-sm p-4" style={{ color: "var(--muted)" }}>
              Loading…
            </p>
          ) : clients.length === 0 ? (
            <p className="text-sm p-4" style={{ color: "var(--muted)" }}>
              No active clients on this stream.
            </p>
          ) : (
            <table className="xui-clients-table w-full text-sm">
              <thead>
                <tr>
                  <th>Quality</th>
                  <th>Line</th>
                  <th>Server</th>
                  <th>IP</th>
                  <th>Duration</th>
                  <th>Output</th>
                  <th>Restreamer</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="xui-quality-dot" title="Active" />
                    </td>
                    <td className="font-medium">{c.line}</td>
                    <td>{c.server}</td>
                    <td>{c.ip ? <IpWithFlag ip={c.ip} /> : "—"}</td>
                    <td>
                      <span className="xui-duration-badge">{c.duration}</span>
                    </td>
                    <td>{c.output}</td>
                    <td>
                      <span
                        className={`xui-restreamer-dot ${c.restreamer ? "xui-restreamer-dot--yes" : ""}`}
                        title={c.restreamer ? "Restreamer" : "Viewer"}
                      />
                    </td>
                    <td>
                      <div className="xui-clients-actions">
                        <button type="button" className="xui-icon-action" title="Kick" onClick={() => kick(c.id)}>
                          <Hammer size={14} />
                        </button>
                        <button type="button" className="xui-icon-action" title="Details" disabled>
                          <Fingerprint size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
