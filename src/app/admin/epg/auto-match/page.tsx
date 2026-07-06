"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Zap, CheckCircle2, X, RefreshCw, Search, ArrowRight } from "lucide-react";

type Stream = {
  id: string;
  name: string;
  epgChannelId?: string | null;
  channelId?: string | null;
};

type EpgChannel = {
  id: string;
  displayName: string;
};

type Match = {
  streamId: string;
  streamName: string;
  epgChannelId: string;
  epgChannelName: string;
  score: number;
  method: string;
  confirmed: boolean;
};

export default function EpgAutoMatchPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [epgChannels, setEpgChannels] = useState<EpgChannel[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState<"all" | "unmatched" | "matched">("unmatched");
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState(0.6);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [streamsRes, channelsRes] = await Promise.all([
        fetch("/api/admin/epg/channels").then((r) => r.json()),
        fetch("/api/admin/epg-sources?action=sources").then((r) => r.json()),
      ]);
      setStreams(streamsRes.streams ?? []);
      
      // Extract unique channel IDs from EPG programs
      const allChannels: EpgChannel[] = [];
      const seen = new Set<string>();
      for (const source of (channelsRes ?? [])) {
        // We'll get channels from the channels API instead
      }
      setEpgChannels(allChannels);
    } catch {
      setMsg("Failed to load data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/hd|sd|fhd|uhd|4k|8k/g, "")
      .replace(/channel|tv|television/g, "")
      .trim();
  }

  function similarity(a: string, b: string): number {
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    
    // Levenshtein-based similarity
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return 1;
    
    const matrix: number[][] = [];
    for (let i = 0; i <= na.length; i++) matrix[i] = [i];
    for (let j = 0; j <= nb.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= na.length; i++) {
      for (let j = 1; j <= nb.length; j++) {
        const cost = na[i - 1] === nb[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    return 1 - matrix[na.length][nb.length] / maxLen;
  }

  async function runAutoMatch() {
    setMatching(true);
    setMsg("");
    
    try {
      // Fetch EPG channels from the database
      const channelsRes = await fetch("/api/admin/epg/channels?action=channels");
      const channelsData = await channelsRes.json();
      const channels: EpgChannel[] = channelsData.channels ?? [];
      
      const unmatchedStreams = streams.filter((s) => !s.epgChannelId);
      const newMatches: Match[] = [];
      
      for (const stream of unmatchedStreams) {
        let bestMatch: { channel: EpgChannel; score: number; method: string } | null = null;
        
        for (const channel of channels) {
          // Exact match
          if (normalize(stream.name) === normalize(channel.displayName)) {
            bestMatch = { channel, score: 1, method: "exact_name" };
            break;
          }
          
          // Fuzzy match
          const score = similarity(stream.name, channel.displayName);
          if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { channel, score, method: "fuzzy_name" };
          }
        }
        
        if (bestMatch && bestMatch.score >= threshold) {
          newMatches.push({
            streamId: stream.id,
            streamName: stream.name,
            epgChannelId: bestMatch.channel.id,
            epgChannelName: bestMatch.channel.displayName,
            score: bestMatch.score,
            method: bestMatch.method,
            confirmed: false,
          });
        }
      }
      
      setMatches(newMatches);
      setMsg(`Found ${newMatches.length} potential matches for ${unmatchedStreams.length} unmatched streams`);
    } catch {
      setMsg("Auto-match failed");
    }
    
    setMatching(false);
  }

  function toggleConfirm(streamId: string) {
    setMatches((prev) =>
      prev.map((m) =>
        m.streamId === streamId ? { ...m, confirmed: !m.confirmed } : m
      )
    );
  }

  function confirmAll() {
    setMatches((prev) => prev.map((m) => ({ ...m, confirmed: true })));
  }

  async function applyConfirmed() {
    const confirmed = matches.filter((m) => m.confirmed);
    if (confirmed.length === 0) {
      setMsg("No matches confirmed");
      return;
    }

    setApplying(true);
    setMsg("");

    try {
      let success = 0;
      let failed = 0;
      
      for (const match of confirmed) {
        const res = await fetch("/api/admin/epg/channels", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            streamId: match.streamId,
            epgChannelId: match.epgChannelId,
          }),
        });
        if (res.ok) success++;
        else failed++;
      }

      setMsg(`Applied ${success} matches${failed > 0 ? `, ${failed} failed` : ""}`);
      setMatches((prev) => prev.filter((m) => !m.confirmed));
      load();
    } catch {
      setMsg("Failed to apply matches");
    }

    setApplying(false);
  }

  const filteredMatches = matches.filter((m) => {
    if (search) {
      const q = search.toLowerCase();
      if (!m.streamName.toLowerCase().includes(q) && !m.epgChannelName.toLowerCase().includes(q)) return false;
    }
    if (filter === "matched") return m.confirmed;
    if (filter === "unmatched") return !m.confirmed;
    return true;
  });

  const unmatchedCount = streams.filter((s) => !s.epgChannelId).length;
  const matchedCount = streams.filter((s) => s.epgChannelId).length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">EPG Auto-Match Tool</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Automatically match streams to EPG channels using name similarity.
          </p>
        </div>
        <Link href="/admin/epg/manage" className="text-sm" style={{ color: "var(--accent)" }}>← Manage EPG</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Total Streams</p>
          <p className="text-xl font-bold">{streams.length}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>With EPG</p>
          <p className="text-xl font-bold text-green-400">{matchedCount}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Without EPG</p>
          <p className="text-xl font-bold text-red-400">{unmatchedCount}</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Found Matches</p>
          <p className="text-xl font-bold text-sky-400">{matches.length}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runAutoMatch}
          disabled={matching || loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {matching ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
          {matching ? "Matching…" : "Run Auto-Match"}
        </button>
        
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: "var(--muted)" }}>Threshold:</span>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-24"
          />
          <span className="tabular-nums w-10">{(threshold * 100).toFixed(0)}%</span>
        </div>

        {matches.length > 0 && (
          <>
            <button
              type="button"
              onClick={confirmAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm cursor-pointer"
              style={{ border: "1px solid var(--border)" }}
            >
              <CheckCircle2 size={14} /> Confirm All
            </button>
            <button
              type="button"
              onClick={applyConfirmed}
              disabled={applying || matches.filter((m) => m.confirmed).length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{ background: "#22c55e", color: "#fff" }}
            >
              {applying ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Apply {matches.filter((m) => m.confirmed).length} Confirmed
            </button>
          </>
        )}
      </div>

      {msg && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          {msg}
        </div>
      )}

      {/* Filters */}
      {matches.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Search size={14} style={{ color: "var(--muted)" }} />
            <input
              type="search"
              placeholder="Search matches…"
              className="rounded border px-3 py-1.5 text-sm bg-transparent"
              style={{ borderColor: "var(--border)" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded border px-3 py-1.5 text-sm bg-transparent"
            style={{ borderColor: "var(--border)" }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">All matches</option>
            <option value="unmatched">Unconfirmed</option>
            <option value="matched">Confirmed</option>
          </select>
        </div>
      )}

      {/* Matches list */}
      {loading ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>Loading…</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>
          <p className="text-lg mb-2">No matches found yet</p>
          <p className="text-sm">Click "Run Auto-Match" to find EPG channels for your streams.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMatches.map((m) => (
            <div
              key={m.streamId}
              className="flex items-center gap-4 rounded-lg border px-4 py-3"
              style={{
                borderColor: m.confirmed ? "rgba(34,197,94,0.3)" : "var(--border)",
                background: m.confirmed ? "rgba(34,197,94,0.05)" : "var(--card)",
              }}
            >
              <button
                type="button"
                onClick={() => toggleConfirm(m.streamId)}
                className="shrink-0 cursor-pointer"
              >
                {m.confirmed ? (
                  <CheckCircle2 size={18} className="text-green-400" />
                ) : (
                  <div className="w-[18px] h-[18px] rounded-full border-2" style={{ borderColor: "var(--border)" }} />
                )}
              </button>
              
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-1">
                <div>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Stream</p>
                  <p className="text-sm font-medium truncate">{m.streamName}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>EPG Channel</p>
                  <p className="text-sm font-medium truncate">{m.epgChannelName}</p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums" style={{ color: m.score >= 0.9 ? "#22c55e" : m.score >= 0.7 ? "#f59e0b" : "#ef4444" }}>
                  {(m.score * 100).toFixed(0)}%
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{m.method}</p>
              </div>

              <button
                type="button"
                onClick={() => setMatches((prev) => prev.filter((x) => x.streamId !== m.streamId))}
                className="shrink-0 p-1 rounded hover:bg-white/10 cursor-pointer"
                title="Remove"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
        <Link href="/admin/epg/channels" className="text-sm" style={{ color: "var(--accent)" }}>Manual Channel Mapping →</Link>
        <Link href="/admin/epg/manage" className="text-sm" style={{ color: "var(--accent)" }}>Manage Sources →</Link>
        <Link href="/admin/epg/calendar" className="text-sm" style={{ color: "var(--accent)" }}>EPG Calendar →</Link>
      </div>
    </div>
  );
}
