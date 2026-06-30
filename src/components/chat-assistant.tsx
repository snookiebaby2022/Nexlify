"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Minimize2, Send } from "lucide-react";

const FAQS = [
  { q: "How do I add a stream?", a: "Go to Live → Add Stream, enter the stream name and source URL (e.g., http://provider.com/stream.m3u8), select a category and server, then save." },
  { q: "What is a bouquet?", a: "A bouquet is a collection of channels that you can assign to a line or reseller. Create bouquets in Bouquets → Add Bouquet, then assign them when creating lines." },
  { q: "How do I create a line?", a: "Go to Subscriptions → Add Line, enter a username and password, select duration (1 month, 3 months, 6 months, 12 months), choose bouquets, and save." },
  { q: "How do I set up EPG?", a: "Go to EPG → Add EPG Source, enter a name and XMLTV URL (e.g., http://epg.provider.com/guide.xml), set sync interval, and save. The EPG will auto-sync." },
  { q: "How do I add a server?", a: "Go to Streaming Servers → Add Server, enter the hostname/IP, ports, and select the server role (Main, LB, or Standard)." },
  { q: "What is catch-up TV?", a: "Catch-up TV allows viewers to replay past broadcasts. Enable it in Settings → Catch-up TV, set duration (7-30 days), and select which channels support it." },
  { q: "How do I create a MAG device?", a: "Go to Subscriptions → Add MAG Device, enter the MAC address from the box (found in Settings → System Info), and save. The device will auto-connect." },
  { q: "How do I white-label the panel?", a: "Go to Settings → White-label Portal, upload your logo, set primary/accent colors, add custom CSS, and configure your domain." },
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "👋 Hi! I'm your Nexlify assistant. Ask me anything about the panel or click a question below." },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function send(text: string) {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    const q = text.toLowerCase();
    const match = FAQS.find((f) => q.includes(f.q.toLowerCase().split(" ").slice(0, 3).join(" ")));
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: match ? match.a : "I can help with: adding streams, creating lines, setting up EPG, managing servers, bouquets, MAG devices, catch-up TV, and white-labeling. Ask me anything!" },
      ]);
    }, 500);
    setInput("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        style={{ background: "var(--accent)" }}
        title="Chat support"
      >
        <MessageCircle size={22} color="#fff" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 right-6 z-50 w-80 rounded-2xl border shadow-2xl overflow-hidden flex flex-col" style={{ borderColor: "var(--border)", background: "var(--bg-card)", height: "480px" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "linear-gradient(90deg, #00c0ef, #5eb8e8)" }}>
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
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "text-white" : ""}`} style={{ background: m.role === "user" ? "var(--accent)" : "rgba(255,255,255,0.08)" }}>
              {m.text}
            </div>
          </div>
        ))}
        <div className="text-xs text-center pt-2" style={{ color: "var(--muted)" }}>Quick questions:</div>
        <div className="flex flex-wrap gap-1">
          {FAQS.slice(0, 4).map((f) => (
            <button key={f.q} type="button" onClick={() => send(f.q)} className="text-xs px-2 py-1 rounded border hover:bg-white/10" style={{ borderColor: "var(--border)" }}>
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
