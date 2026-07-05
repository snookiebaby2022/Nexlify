"use client";

import { useState } from "react";
import { Star, Award, Search } from "lucide-react";

type LoyaltyPoint = {
  lineId: string;
  points: number;
  level: string;
  badges: string[];
};

const BADGE_OPTIONS = ["Early Adopter", "Power User", "VIP", "Streamer", "1 Year Anniversary"];

export default function LoyaltyProgramPage() {
  const [lineId, setLineId] = useState("");
  const [points, setPoints] = useState<LoyaltyPoint | null>(null);
  const [addAmount, setAddAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!lineId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/loyalty-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", lineId }),
      });
      const data = await res.json();
      setPoints(data);
    } finally {
      setLoading(false);
    }
  };

  const addPoints = async () => {
    if (!lineId || addAmount <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/loyalty-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", lineId, points: addAmount }),
      });
      const data = await res.json();
      setPoints(data);
      setAddAmount(0);
    } finally {
      setLoading(false);
    }
  };

  const awardBadge = async (badge: string) => {
    if (!lineId) return;
    setLoading(true);
    try {
      await fetch("/api/admin/loyalty-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "badge", lineId, badge }),
      });
      lookup();
    } finally {
      setLoading(false);
    }
  };

  const levelColor = (level: string) => {
    if (level === "Gold") return "text-yellow-400";
    if (level === "Silver") return "text-gray-300";
    return "text-amber-600";
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold">Viewer Loyalty Program</h1>

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <h3 className="text-sm font-semibold mb-3">Lookup Viewer</h3>
        <div className="flex gap-2">
          <input value={lineId} onChange={e => setLineId(e.target.value)} placeholder="Line ID" className="flex-1 px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <button onClick={lookup} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            <Search size={14} /> Lookup
          </button>
        </div>
      </div>

      {points && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <Star size={24} className={`mx-auto mb-2 ${levelColor(points.level)}`} />
              <div className="text-2xl font-bold">{points.points}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Points</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <Award size={24} className="mx-auto mb-2" style={{ color: "var(--accent)" }} />
              <div className="text-2xl font-bold">{points.level}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Level</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-2xl font-bold">{points.badges.length}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Badges</div>
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <h3 className="text-sm font-semibold mb-3">Add Points</h3>
            <div className="flex gap-2">
              <input type="number" value={addAmount} onChange={e => setAddAmount(+e.target.value)} placeholder="Points" className="w-32 px-3 py-1.5 rounded border text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              <button onClick={addPoints} disabled={loading} className="px-3 py-1.5 rounded text-sm" style={{ background: "var(--accent)", color: "#fff" }}>Add</button>
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <h3 className="text-sm font-semibold mb-3">Award Badge</h3>
            <div className="flex flex-wrap gap-2">
              {BADGE_OPTIONS.map(b => (
                <button key={b} onClick={() => awardBadge(b)} className="px-3 py-1.5 rounded border text-xs" style={{ borderColor: "var(--border)" }}>
                  {points.badges.includes(b) ? "✓ " : ""}{b}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
