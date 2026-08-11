"use client";

import { useState, useMemo } from "react";
import { Check, Folder, FolderOpen, Plus, Trash2, Zap } from "lucide-react";

type CategoryType = "LIVE" | "MOVIE" | "SERIES" | "RADIO";

type Category = {
  name: string;
  categoryType: CategoryType;
  isAdult?: boolean;
  sortOrder?: number;
};

type Result = {
  url: string;
  ok: boolean;
  created?: number;
  updated?: number;
  unchanged?: number;
  error?: string;
};

const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  LIVE: "Live Streams",
  MOVIE: "Movies",
  SERIES: "Series",
  RADIO: "Radio",
};

const PREDEFINED_CATEGORIES: Record<CategoryType, string[]> = {
  LIVE: [
    "UK Entertainment", "UK Sports", "UK News", "UK Movies", "UK Documentaries",
    "US Entertainment", "US Sports", "US News", "US Movies",
    "Canadian", "Australian", "Irish",
    "Sports", "Football", "Cricket", "Rugby", "Boxing", "UFC/MMA", "Tennis", "Golf", "F1/Motorsport",
    "News", "Kids", "Documentaries", "Music", "Religious", "Adult",
    "Arabic", "Turkish", "Indian", "Pakistani", "Bangla", "Filipino", "African",
    "French", "German", "Spanish", "Italian", "Portuguese", "Dutch", "Polish", "Scandinavian",
    "Greek", "Romanian", "Hungarian", "Czech", "Balkan",
    "Chinese", "Japanese", "Korean", "Thai", "Vietnamese",
    "Latino", "Brazilian", "Mexican", "Argentine", "Colombian",
  ],
  MOVIE: [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music",
    "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
    "Bollywood", "Lollywood", "Turkish", "Arabic", "French", "Spanish",
    "Korean", "Japanese", "Chinese", "Thai",
  ],
  SERIES: [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music",
    "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
    "Bollywood", "Turkish", "Arabic", "Korean", "Japanese",
    "Reality", "Talk Show", "Game Show",
  ],
  RADIO: [
    "Music", "News", "Talk", "Sports", "Religious", "Comedy", "Classic", "Jazz", "Rock", "Pop",
  ],
};

export function AdminCategories() {
  const [activeType, setActiveType] = useState<CategoryType>("LIVE");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState("");
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [urls, setUrls] = useState("");
  const [secret, setSecret] = useState("");
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandType, setExpandType] = useState<CategoryType | null>("LIVE");

  const predefinedForType = PREDEFINED_CATEGORIES[activeType];

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set(predefinedForType);
    setSelected(all);
  };

  const clearSelection = () => setSelected(new Set());

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    if (customCategories.some((c) => c.name === name && c.categoryType === activeType)) return;
    setCustomCategories((prev) => [...prev, { name, categoryType: activeType }]);
    setCustomName("");
  };

  const removeCustom = (name: string) => {
    setCustomCategories((prev) => prev.filter((c) => !(c.name === name && c.categoryType === activeType)));
  };

  const allCategories: Category[] = useMemo(() => {
    const predefined: Category[] = [...selected].map((name) => ({
      name,
      categoryType: activeType,
    }));
    const custom = customCategories.filter((c) => c.categoryType === activeType);
    return [...predefined, ...custom];
  }, [selected, customCategories, activeType]);

  const push = async (broadcast = false) => {
    if (allCategories.length === 0) {
      alert("Select or add at least one category");
      return;
    }

    if (!broadcast) {
      const list = urls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!list.length) {
        alert("Enter at least one panel URL");
        return;
      }
      if (!confirm(`Push ${allCategories.length} categories to ${list.length} panel(s)?`)) return;
    } else {
      if (!confirm(`Push ${allCategories.length} categories to ALL panels?`)) return;
    }

    setLoading(true);
    setResults([]);

    try {
      const endpoint = broadcast
        ? "/api/admin/remote-categories/broadcast"
        : "/api/admin/remote-categories";
      const body = broadcast
        ? { categories: allCategories, deleteMissing }
        : {
            panelUrls: urls.split("\n").map((s) => s.trim()).filter(Boolean),
            categories: allCategories,
            deleteMissing,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([{ url: broadcast ? "broadcast" : "local", ok: false, error: "Request failed" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Type Tabs */}
      <section className="glass rounded-2xl p-6">
        <h2 className="font-display text-xl font-semibold text-white">Categories</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Select predefined categories or add custom ones, then push to your panels remotely.
        </p>

        <div className="mt-4 flex gap-2">
          {(Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeType === type
                  ? "bg-violet-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {CATEGORY_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </section>

      {/* Predefined Categories */}
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-white">
            Predefined {CATEGORY_TYPE_LABELS[activeType]} Categories
          </h3>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-violet-400 hover:text-violet-300">
              Select All
            </button>
            <span className="text-slate-600">|</span>
            <button onClick={clearSelection} className="text-xs text-slate-400 hover:text-white">
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {predefinedForType.map((name) => {
            const isSelected = selected.has(name);
            return (
              <button
                key={name}
                onClick={() => toggleSelect(name)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  isSelected
                    ? "border-violet-500 bg-violet-500/10 text-white"
                    : "border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:text-white"
                }`}
              >
                {isSelected ? <Check className="h-3.5 w-3.5 text-violet-400" /> : <Folder className="h-3.5 w-3.5 opacity-50" />}
                {name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom Categories */}
      <section className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-white">Custom Categories</h3>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Enter category name..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
          />
          <button
            onClick={addCustom}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {customCategories.filter((c) => c.categoryType === activeType).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {customCategories
              .filter((c) => c.categoryType === activeType)
              .map((cat) => (
                <span
                  key={cat.name}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white"
                >
                  {cat.name}
                  <button onClick={() => removeCustom(cat.name)} className="text-slate-400 hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
          </div>
        )}
      </section>

      {/* Selected Summary */}
      <section className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-white">
          Selected Categories ({allCategories.length})
        </h3>
        {allCategories.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No categories selected. Select predefined or add custom ones above.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {allCategories.map((cat) => (
              <span
                key={`${cat.categoryType}-${cat.name}`}
                className="rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-1.5 text-sm text-violet-300"
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Push to Panels */}
      <section className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold text-white">Push to Panels</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Push the selected categories to your panels. Categories with matching names will be updated; new ones will be created.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-300">Panel URLs (one per line)</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={"https://panel.example.com\nhttps://another.panel.com"}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none min-h-[100px] font-mono"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300">Panel API Secret</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="PANEL_API_SECRET"
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={deleteMissing}
              onChange={(e) => setDeleteMissing(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-violet-500 focus:ring-violet-500"
            />
            Delete categories on panels that are not in this list
          </label>

          <div className="flex gap-3">
            <button
              onClick={() => push(false)}
              disabled={loading || allCategories.length === 0}
              className="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {loading ? "Pushing..." : `Push to These Panels`}
            </button>

            <button
              onClick={() => push(true)}
              disabled={loading || allCategories.length === 0}
              className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-6 py-2.5 text-sm font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
            >
              {loading ? "Broadcasting..." : "Broadcast to ALL Panels"}
            </button>
          </div>
        </div>
      </section>

      {/* Results */}
      {results.length > 0 && (
        <section className="glass rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold text-white">Results</h3>
          <div className="mt-4 space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 text-sm ${
                  r.ok ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"
                }`}
              >
                <div className="font-mono text-xs text-slate-400 break-all">{r.url}</div>
                <div className={`mt-1 ${r.ok ? "text-green-400" : "text-red-400"}`}>
                  {r.ok
                    ? `Created: ${r.created ?? 0}, Updated: ${r.updated ?? 0}, Unchanged: ${r.unchanged ?? 0}`
                    : `Failed${r.error ? ` — ${r.error}` : ""}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
