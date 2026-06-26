"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Users, Globe, ExternalLink, Clock, Tv, LifeBuoy, Activity, Gauge } from "lucide-react";
import type { SummaryCardData } from "@/lib/dashboard-widgets";

const CARD_STYLES = {
  orange: { header: "linear-gradient(135deg, #f39c12 0%, #e08e0b 100%)" },
  green: { header: "linear-gradient(135deg, #00a65a 0%, #008d4c 100%)" },
  purple: { header: "linear-gradient(135deg, #605ca8 0%, #4a4785 100%)" },
  emerald: { header: "linear-gradient(135deg, #1e7e34 0%, #155724 100%)" },
  teal: { header: "linear-gradient(135deg, #17a2b8 0%, #117a8b 100%)" },
} as const;

const BAR_COLORS = {
  green: "#00a65a",
  blue: "#3c8dbc",
  orange: "#f39c12",
  red: "#dd4b39",
  purple: "#605ca8",
} as const;

function CardIcon({ id }: { id: string }) {
  const props = { size: 28, strokeWidth: 1.5, style: { opacity: 0.9 } };
  if (id === "credits") return <Coins {...props} />;
  if (id === "expiring") return <Clock {...props} />;
  if (id === "devices") return <Tv {...props} />;
  if (id === "new-lines") return <Users {...props} />;
  if (id === "stream-health") return <Activity {...props} />;
  if (id === "tickets") return <LifeBuoy {...props} />;
  if (id === "bandwidth") return <Gauge {...props} />;
  if (id.includes("subs")) return <Users {...props} />;
  return <Globe {...props} />;
}

function SummaryCard({ card }: { card: SummaryCardData }) {
  const style = CARD_STYLES[card.variant];
  const title = (
    <div className="flex items-center gap-1.5">
      <span>{card.title}</span>
      {card.href && (
        <ExternalLink size={12} style={{ opacity: 0.7 }} />
      )}
    </div>
  );

  const body = (
    <div
      className="rounded-xl border overflow-hidden h-full"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between text-white"
        style={{ background: style.header }}
      >
        <div>
          <p className="text-xs font-medium opacity-90">{title}</p>
          <p className="text-2xl font-bold mt-0.5">{card.total.toLocaleString()}</p>
        </div>
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <CardIcon id={card.id} />
        </div>
      </div>
      <div className="p-4 space-y-3">
        {card.rows.map((row) => {
          const pct = row.total > 0 ? Math.round((row.value / row.total) * 100) : 0;
          return (
            <div key={row.label}>
              <div className="flex justify-between text-xs mb-1">
                <span style={{ color: "var(--muted)" }}>
                  {row.label} ({row.value.toLocaleString()})
                </span>
                <span className="font-medium">{pct}%</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: BAR_COLORS[row.color],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (card.href) {
    return (
      <Link href={card.href} className="block h-full hover:opacity-95 transition-opacity">
        {body}
      </Link>
    );
  }
  return body;
}

export function DashboardXuiSummaryCards({ widgetsUrl }: { widgetsUrl: string }) {
  const [cards, setCards] = useState<SummaryCardData[]>([]);

  const load = useCallback(() => {
    fetch(widgetsUrl)
      .then((r) => r.json())
      .then((data: { cards?: SummaryCardData[] }) => setCards(data.cards ?? []))
      .catch(() => setCards([]));
  }, [widgetsUrl]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (cards.length === 0) return null;

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      {cards.map((card) => (
        <SummaryCard key={card.id} card={card} />
      ))}
    </div>
  );
}
