"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Minimize2, Send } from "lucide-react";

const FAQS = [
  {
    q: "How do I add a stream?",
    keys: ["add stream", "create stream", "new channel", "live stream"],
    a: "Go to Live / Radio / Channel → Add Stream. Enter name + source URL (e.g. http://provider/live.m3u8), pick category & server, then save.",
  },
  {
    q: "Where are bouquets?",
    keys: ["bouquet", "bouquets", "package channels"],
    a: "Open the Bouquets sidebar group → Manage Bouquets. Categories (Live TV / Movies / Series) are separate under Categories. Assign bouquets to lines when creating subscriptions.",
  },
  {
    q: "How do I create a line?",
    keys: ["create line", "add line", "subscription", "username password"],
    a: "Subscriptions → Add Line. Set username/password, duration, then choose bouquets on the Bouquets step before Create line.",
  },
  {
    q: "How do I set up EPG?",
    keys: ["epg", "xmltv", "tv guide"],
    a: "EPG → Add EPG Source with an XMLTV URL, set sync interval, then use EPG Auto-Match or Channel Map to link channels.",
  },
  {
    q: "How do I add a server?",
    keys: ["add server", "load balancer", "streaming server"],
    a: "Streaming Servers → Add Server. Enter host/IP, ports, and role (Main / LB / Standard). Use Load Balancer for auto-balance live across LBs.",
  },
  {
    q: "Reseller cannot see bouquets",
    keys: ["reseller bouquet", "empty bouquet", "reseller line"],
    a: "Admin → Bouquets → Bouquet Access (Resellers), or run Repair import / migrate again so ResellerBouquet rows are granted. Resellers only see assigned bouquets.",
  },
  {
    q: "How do I create a MAG device?",
    keys: ["mag", "stalker", "mac address"],
    a: "Subscriptions → Add MAG Device. Enter the MAC from the box (Settings → System Info). Portal URL is your panel DNS.",
  },
  {
    q: "Suggestions and report",
    keys: ["suggestion", "report", "ticket"],
    a: "Use Suggestions or Report at the bottom of the sidebar. They create Support tickets (Open). Admins manage them under Tickets → Open / Closed.",
  },
];

function matchFaq(text: string): string | null {
  const q = text.toLowerCase();
  for (const f of FAQS) {
    if (f.keys.some((k) => q.includes(k))) return f.a;
    const words = f.q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => q.includes(w)).length;
    if (hits >= Math.min(2, words.length)) return f.a;
  }
  return null;
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    {
      role: "assistant",
      text: "Hi! I can help with streams, bouquets, lines, EPG, servers, MAG, tickets, and reseller access. Ask a question or tap one below.",
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    const answer =
      matchFaq(text) ||
      "Try asking about: bouquets location, add stream, create line, EPG, servers, MAG, or reseller bouquet access. For AI chat with your panel data, open AI → Support Chat.";
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    }, 250);
    setInput("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-36 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        style={{ background: "var(--accent)" }}
        title="Chat support"
      >
        <MessageCircle size={22} color="#fff" />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-36 right-6 z-50 w-80 rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", height: "480px" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "linear-gradient(90deg, #00c0ef, #5eb8e8)" }}
      >
        <span className="text-sm font-semibold text-white">Nexlify Assistant</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20 text-white">
            <Minimize2 size={14} />
          </button>
          <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/20 text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "text-white" : ""}`}
              style={{ background: m.role === "user" ? "var(--accent)" : "rgba(255,255,255,0.08)" }}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div className="text-xs text-center pt-2" style={{ color: "var(--muted)" }}>
          Quick questions:
        </div>
        <div className="flex flex-wrap gap-1">
          {FAQS.slice(0, 5).map((f) => (
            <button
              key={f.q}
              type="button"
              onClick={() => send(f.q)}
              className="text-xs px-2 py-1 rounded border hover:bg-white/10"
              style={{ borderColor: "var(--border)" }}
            >
              {f.q}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-t flex gap-2" style={{ borderColor: "var(--border)" }}>
        <input
          type="text"
          placeholder="Ask a question..."
          className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent"
          style={{ borderColor: "var(--border)" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        <button type="button" onClick={() => send(input)} className="p-2 rounded-lg" style={{ background: "var(--accent)" }}>
          <Send size={16} color="#fff" />
        </button>
      </div>
    </div>
  );
}
