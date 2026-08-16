"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Zap, Shield, TrendingUp, Users, Radio, Share2, MessageSquare, Play, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";

type StreamQuality = {
  streamId: string;
  streamName: string;
  score: number;
  bitrate: number;
  resolution: string;
  fps: number;
  bufferingEvents: number;
};

type BandwidthPrediction = {
  predictedMbps: number;
  confidence: number;
  trend: string;
  peakTime: string;
  recommendation: string;
};

type ChannelTrend = {
  streamId: string;
  streamName: string;
  viewers: number;
  change: number;
  trend: string;
};

type StreamTestResult = {
  streamId: string;
  streamName: string;
  accessible: boolean;
  latencyMs: number;
  score: number;
  errors: string[];
};

function asList<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const key of ["qualities", "streams", "trends", "results", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

export default function UniqueFeaturesPage() {
  const [tab, setTab] = useState("quality");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [qualityData, setQualityData] = useState<StreamQuality[]>([]);
  const [bandwidth, setBandwidth] = useState<BandwidthPrediction | null>(null);
  const [trends, setTrends] = useState<ChannelTrend[]>([]);
  const [testResults, setTestResults] = useState<StreamTestResult[]>([]);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [qualityRes, bwRes, trendsRes] = await Promise.all([
        fetch("/api/admin/stream-quality?action=all").then((r) => r.json()).catch(() => []),
        fetch("/api/admin/bandwidth-predict?action=predict").then((r) => r.json()).catch(() => null),
        fetch("/api/admin/engagement?action=trends").then((r) => r.json()).catch(() => []),
      ]);
      setQualityData(asList<StreamQuality>(qualityRes));
      setBandwidth(bwRes && !bwRes.error && !Array.isArray(bwRes) ? bwRes : null);
      setTrends(asList<ChannelTrend>(trendsRes));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const testStreams = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stream-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-all" }),
      });
      const data = await res.json();
      setTestResults(asList<StreamTestResult>(data));
    } finally {
      setLoading(false);
    }
  };

  const gradeColor = (score: number) => {
    if (score >= 90) return "#22c55e";
    if (score >= 70) return "#eab308";
    if (score >= 50) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-6">
      <div
        className="px-5 py-5 rounded-xl"
        style={{ background: "linear-gradient(135deg, rgba(0,192,239,0.15) 0%, rgba(168,85,247,0.12) 50%, transparent 100%)" }}
      >
        <h1 className="text-2xl font-bold">Unique Features</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Features no other IPTV panel has — real-time quality scoring, smart CDN, predictive analytics
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "quality", label: "Stream Quality", icon: Zap },
          { id: "cdn", label: "Smart CDN", icon: Shield },
          { id: "bandwidth", label: "Bandwidth", icon: TrendingUp },
          { id: "engagement", label: "Engagement", icon: Users },
          { id: "testing", label: "Stream Testing", icon: Radio },
          { id: "social", label: "Social Media", icon: Share2 },
          { id: "collab", label: "Collaboration", icon: MessageSquare },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${tab === t.id ? "text-white" : "border"}`}
            style={tab === t.id ? { background: "var(--accent)" } : { borderColor: "var(--border)" }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Stream Quality Scoring */}
      {tab === "quality" && (
        <div className="space-y-4">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Real-time Stream Quality Scoring</h3>
              <button onClick={loadData} disabled={loading} className="flex items-center gap-1 text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }}>
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {qualityData.map((q) => (
                <div key={q.streamId} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium truncate">{q.streamName}</span>
                    <span className="text-lg font-bold tabular-nums" style={{ color: gradeColor(q.score) }}>{q.score}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]" style={{ color: "var(--muted)" }}>
                    <div>Bitrate: {q.bitrate}kbps</div>
                    <div>Resolution: {q.resolution || "—"}</div>
                    <div>FPS: {q.fps}</div>
                    <div>Buffering: {q.bufferingEvents}</div>
                  </div>
                </div>
              ))}
              {!qualityData.length && <p className="text-sm col-span-full text-center py-4" style={{ color: "var(--muted)" }}>No streams with quality data yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Smart CDN Switching */}
      {tab === "cdn" && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Smart CDN Switching</h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Automatically switch between CDNs based on real-time performance. Manage endpoints on the
            Smart CDN page, then probe here.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/streaming/smart-cdn"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border"
              style={{ borderColor: "var(--border)" }}
            >
              Manage CDN endpoints
            </a>
            <button
              onClick={async () => {
                setLoading(true);
                await fetch("/api/admin/cdn-switch?action=probe");
                setLoading(false);
              }}
              disabled={loading}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border"
              style={{ borderColor: "var(--border)" }}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Probe All CDNs
            </button>
          </div>
        </div>
      )}

      {/* Predictive Bandwidth */}
      {tab === "bandwidth" && bandwidth && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--accent)" }}>{bandwidth.predictedMbps}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Predicted Mbps</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-2xl font-bold tabular-nums">{Math.round(bandwidth.confidence * 100)}%</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Confidence</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-2xl font-bold tabular-nums capitalize">{bandwidth.trend}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Trend</div>
            </div>
            <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-2xl font-bold tabular-nums">{bandwidth.peakTime}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Peak Time</div>
            </div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{bandwidth.recommendation}</p>
          </div>
        </div>
      )}

      {/* Viewer Engagement */}
      {tab === "engagement" && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Trending Channels</h3>
          <div className="space-y-2">
            {trends.map((t) => (
              <div key={t.streamId} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm font-medium">{t.streamName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums">{t.viewers} viewers</span>
                  <span className={`text-xs font-medium ${t.trend === "rising" ? "text-green-400" : t.trend === "falling" ? "text-red-400" : "text-neutral-400"}`}>
                    {t.change > 0 ? "+" : ""}{t.change}%
                  </span>
                </div>
              </div>
            ))}
            {!trends.length && <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>No trending channels yet</p>}
          </div>
        </div>
      )}

      {/* Stream Testing */}
      {tab === "testing" && (
        <div className="space-y-4">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Automated Stream Testing</h3>
              <button onClick={testStreams} disabled={loading} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border" style={{ borderColor: "var(--border)" }}>
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Test All Streams
              </button>
            </div>
            <div className="space-y-2">
              {testResults.map((r) => (
                <div key={r.streamId} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    {r.accessible ? <CheckCircle size={14} className="text-green-400" /> : <XCircle size={14} className="text-red-400" />}
                    <span className="text-sm font-medium">{r.streamName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs tabular-nums">{r.latencyMs}ms</span>
                    <span className="text-xs font-bold" style={{ color: gradeColor(r.score) }}>{r.score}</span>
                  </div>
                </div>
              ))}
              {!testResults.length && <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>Click "Test All Streams" to check stream health</p>}
            </div>
          </div>
        </div>
      )}

      {/* Social Media */}
      {tab === "social" && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Social Media Integration</h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            Stream to multiple platforms simultaneously. Configure your social media API keys in settings.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {["YouTube", "Twitch", "Facebook", "Twitter/X", "Instagram"].map((platform) => (
              <div key={platform} className="rounded-lg border p-3 text-center" style={{ borderColor: "var(--border)" }}>
                <div className="text-sm font-medium">{platform}</div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>Not configured</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collaboration */}
      {tab === "collab" && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <h3 className="text-sm font-semibold mb-3">Real-time Collaboration</h3>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            See who's online, share notes, and coordinate with other admins in real-time.
          </p>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            No other admins online currently
          </div>
        </div>
      )}
    </div>
  );
}
