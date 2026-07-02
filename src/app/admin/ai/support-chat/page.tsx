"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function SupportChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/ai/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to get response");
      }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "No response." }]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">AI Support Chat</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Ask the AI assistant anything about your panel — troubleshooting, configuration, or general guidance.
        </p>
      </div>

      <div
        className="rounded-lg border flex flex-col"
        style={{ borderColor: "var(--border)", height: "calc(100vh - 220px)", minHeight: 400 }}
      >
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Start a conversation — ask me anything about your panel.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm"
                style={{
                  background: msg.role === "user" ? "var(--accent)" : "var(--bg)",
                  color: msg.role === "user" ? "white" : "inherit",
                  border: msg.role === "user" ? "none" : "1px solid var(--border)",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-lg px-4 py-2.5 text-sm"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}
              >
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 border-t flex gap-3" style={{ borderColor: "var(--border)" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 rounded-lg border px-4 py-2.5 text-sm bg-transparent outline-none"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
