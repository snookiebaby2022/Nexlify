"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Send, Smile, X } from "lucide-react";
import { ALL_CHAT_EMOJIS, CHAT_EMOJI_CATEGORIES } from "@/lib/chat-emojis";
import { UserAvatar } from "@/components/user-avatar";
import { formatDateTime } from "@/lib/format";

type ChatMsg = {
  id: string;
  body: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: string;
    avatarUrl: string | null;
  };
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#ff4500",
  RESELLER: "#5eb8e8",
  SUB_RESELLER: "#a78bfa",
};

const LAST_SEEN_KEY = "nexlify-chat-last-seen";

function readLastSeen(): string {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeLastSeen(iso: string) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, iso);
  } catch {
    /* ignore */
  }
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
      style={{ background: "#ff4500" }}
      aria-label={`${count} unread chat messages`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function PanelLiveChat({
  username,
  variant = "sidebar",
}: {
  username: string;
  variant?: "sidebar" | "float";
}) {
  const [open, setOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiTab, setEmojiTab] = useState(CHAT_EMOJI_CATEGORIES[0].id);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    const res = await fetch("/api/panel/chat");
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages ?? []);
  }, []);

  const loadUnread = useCallback(async () => {
    const since = readLastSeen();
    const qs = new URLSearchParams({ count: "1" });
    if (since) qs.set("since", since);
    const res = await fetch(`/api/panel/chat?${qs}`);
    if (!res.ok) return;
    const data = await res.json();
    setUnread(Number(data.unread ?? 0));
  }, []);

  const markSeen = useCallback(() => {
    writeLastSeen(new Date().toISOString());
    setUnread(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    markSeen();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [open, load, markSeen]);

  useEffect(() => {
    if (open) return;
    loadUnread();
    const t = setInterval(loadUnread, 15000);
    return () => clearInterval(t);
  }, [open, loadUnread]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/panel/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        setDraft("");
        setEmojiOpen(false);
        markSeen();
        await load();
        try {
          window.dispatchEvent(new Event("nexlify-notifications-updated"));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  }

  function appendEmoji(e: string) {
    setDraft((d) => `${d}${e}`);
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) markSeen();
      return next;
    });
  }

  const panel = open && (
    <div
      className={`w-[min(100vw-2rem,380px)] h-[min(70vh,520px)] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
        variant === "sidebar" ? "fixed bottom-4 left-[max(0.75rem,calc(var(--panel-sidebar-w,300px)+0.75rem))] z-[300]" : ""
      }`}
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-card)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          background: "linear-gradient(90deg, #ff4500 0%, #ff8717 100%)",
          color: "#fff",
        }}
      >
        <div>
          <div className="font-semibold text-sm">Live chat</div>
          <div className="text-xs opacity-90">Admins & resellers · notifications on</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 rounded cursor-pointer hover:bg-white/20"
          aria-label="Close chat"
        >
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => {
          const mine = m.user.username === username;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <UserAvatar username={m.user.username} photoUrl={m.user.avatarUrl} size={28} />
              <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                <div className="text-[10px] mb-0.5 flex flex-wrap gap-1 items-center" style={{ color: "var(--muted)" }}>
                  <span className="font-medium">{m.user.displayName || m.user.username}</span>
                  <span
                    className="rounded px-1 py-0.5 font-semibold uppercase"
                    style={{
                      fontSize: 9,
                      background: `${ROLE_COLORS[m.user.role] ?? "#888"}33`,
                      color: ROLE_COLORS[m.user.role] ?? "#888",
                    }}
                  >
                    {m.user.role}
                  </span>
                </div>
                <div
                  className="rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words"
                  style={{
                    background: mine ? "rgba(255,69,0,0.15)" : "rgba(94,184,232,0.12)",
                    border: `1px solid ${mine ? "rgba(255,69,0,0.25)" : "rgba(94,184,232,0.25)"}`,
                  }}
                >
                  {m.body}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
                  {formatDateTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
        {!messages.length && (
          <p className="text-center text-sm py-8" style={{ color: "var(--muted)" }}>
            Say hello — everyone on the panel can see this chat.
          </p>
        )}
      </div>

      {emojiOpen && (
        <div className="border-t max-h-40 overflow-hidden flex flex-col shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-1 overflow-x-auto px-2 py-1 text-[10px] border-b" style={{ borderColor: "var(--border)" }}>
            {CHAT_EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEmojiTab(c.id)}
                className="px-2 py-1 rounded cursor-pointer whitespace-nowrap"
                style={{
                  background: emojiTab === c.id ? "rgba(255,69,0,0.15)" : "transparent",
                  color: emojiTab === c.id ? "#ff4500" : "var(--muted)",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto p-2 grid grid-cols-8 gap-0.5">
            {(CHAT_EMOJI_CATEGORIES.find((c) => c.id === emojiTab)?.emojis ?? ALL_CHAT_EMOJIS).map((e) => (
              <button
                key={e}
                type="button"
                className="text-lg p-1 rounded hover:bg-white/5 cursor-pointer"
                onClick={() => appendEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-2 border-t flex gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          className="p-2 rounded-lg border cursor-pointer shrink-0"
          style={{ borderColor: "var(--border)" }}
          title="Emoji"
        >
          <Smile size={18} />
        </button>
        <input
          className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent min-w-0"
          style={{ borderColor: "var(--border)" }}
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
          className="p-2 rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
          style={{ background: "#ff4500", color: "#fff" }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );

  if (variant === "sidebar") {
    return (
      <>
        <button
          type="button"
          onClick={toggleOpen}
          className="panel-sidebar-report-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
          title={unread ? `${unread} unread chat messages` : "Live chat"}
        >
          <MessageCircle size={18} className="shrink-0" style={{ color: "#ff4500" }} />
          <span className="truncate">Live chat</span>
          <UnreadBadge count={unread} />
        </button>
        {mounted && open && createPortal(panel, document.body)}
      </>
    );
  }

  return (
    <div className="fixed bottom-16 left-4 z-[300] flex flex-col items-start gap-2">
      {panel}
      <button
        type="button"
        onClick={toggleOpen}
        className="relative flex items-center gap-2 rounded-full px-4 py-3 shadow-lg font-semibold text-sm cursor-pointer"
        style={{ background: "#ff4500", color: "#fff" }}
      >
        <MessageCircle size={20} />
        {open ? "Hide chat" : "Live chat"}
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 rounded-full bg-white text-[#ff4500] text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
    </div>
  );
}
