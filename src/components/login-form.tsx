"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Lock, Shield, User } from "lucide-react";
import { Login3dLogo } from "@/components/login-3d-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoAccentToggle } from "@/components/logo-accent-toggle";

const DEMO_ACCOUNTS = [
  { label: "Admin", username: "admin", password: "admin123" },
  { label: "Reseller", username: "reseller", password: "reseller123" },
] as const;

const REMEMBER_KEY = "nexlify_remember_username";

export function LoginForm({ showDemoLogins = false }: { showDemoLogins?: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [community, setCommunity] = useState({
    telegramUrl: "",
    discordUrl: "",
    signalUrl: "",
  });
  const [whiteLabel, setWhiteLabel] = useState<{
    logoUrl: string;
    accentColor: string;
  } | null>(null);

  useEffect(() => {
    if (!username.trim() || username.length < 2) {
      setWhiteLabel(null);
      return;
    }
    const t = window.setTimeout(() => {
      fetch(`/api/public/white-label?username=${encodeURIComponent(username.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.whiteLabel?.logoUrl || d?.whiteLabel?.accentColor) {
            setWhiteLabel({
              logoUrl: d.whiteLabel.logoUrl,
              accentColor: d.whiteLabel.accentColor,
            });
          } else {
            setWhiteLabel(null);
          }
        })
        .catch(() => setWhiteLabel(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [username]);

  useEffect(() => {
    fetch("/api/public/community-links")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCommunity({
          telegramUrl: String(d.telegramUrl ?? ""),
          discordUrl: String(d.discordUrl ?? ""),
          signalUrl: String(d.signalUrl ?? ""),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
  }, []);

  async function signIn() {
    if (loading) return;
    setLoading(true);
    setError("");
    let res: Response;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          totpCode: needsTotp ? totpCode : undefined,
          rememberMe,
        }),
      });
    } catch {
      setLoading(false);
      setError("Could not reach the server. Check your connection and try again.");
      return;
    }

    let data: { error?: string; requiresTotp?: boolean; redirect?: string } = {};
    try {
      data = await res.json();
    } catch {
      setLoading(false);
      setError(res.ok ? "Invalid server response." : `Login failed (${res.status}).`);
      return;
    }
    setLoading(false);
    if (!res.ok) {
      if (data.requiresTotp) setNeedsTotp(true);
      setError(data.error ?? "Login failed");
      return;
    }
    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY, username.trim());
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
    window.location.assign(data.redirect ?? "/admin/dashboard");
    return;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void signIn();
  }

  return (
    <div className="min-h-screen login-page-bg relative overflow-hidden flex flex-col">
      <header className="login-top-header sticky top-0 z-30 shrink-0 w-full">
        <div className="panel-header-controls flex items-center justify-end gap-2 px-4 sm:px-6 py-2.5">
          <div className="panel-header-toggle-bar flex items-center gap-2 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Logo
            </span>
            <LogoAccentToggle />
            <span className="w-px h-5 bg-white/10" aria-hidden />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="login-grid-overlay absolute inset-0 pointer-events-none" />
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row">
        <aside className="flex flex-col justify-center items-center lg:items-start px-8 py-12 lg:py-0 lg:w-[46%] lg:min-h-screen lg:pl-14 xl:pl-20 gap-8 text-center lg:text-left">
          {whiteLabel?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={whiteLabel.logoUrl} alt="" className="h-16 w-auto max-w-[220px] object-contain" />
          ) : (
            <Login3dLogo size="lg" />
          )}
          <div className="space-y-3 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-400/90">
              Nexlify Panel
            </p>
            <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
              Stream management,
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-blue-400 to-orange-400">
                built for operators
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Secure access to lines, servers, bouquets, and live streams — all in one control panel.
            </p>
          </div>
          <ul className="hidden sm:flex flex-col gap-2 text-sm text-slate-500">
            <li className="flex items-center gap-2">
              <Shield size={16} className="text-sky-400 shrink-0" />
              Session protection & optional 2FA
            </li>
            <li className="flex items-center gap-2">
              <Lock size={16} className="text-orange-400 shrink-0" />
              Encrypted credentials at rest
            </li>
          </ul>
        </aside>

        <main className="flex-1 flex items-center justify-center px-6 pb-12 lg:pb-0 lg:pr-12 xl:pr-16">
          <form
            onSubmit={onSubmit}
            className="w-full max-w-[420px] rounded-2xl border p-8 sm:p-10 space-y-5 backdrop-blur-xl shadow-2xl"
            style={{
              background: "rgba(17, 27, 46, 0.72)",
              borderColor: whiteLabel?.accentColor ?? "rgba(148, 163, 184, 0.18)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div className="lg:hidden flex justify-center mb-2">
              <Login3dLogo size="sm" />
            </div>
            <div className="space-y-1 text-center lg:text-left">
              <h2 className="text-xl font-semibold text-white">Sign in</h2>
              <p className="text-sm text-slate-400">Enter your panel credentials</p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-300">Username</span>
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-0.5 transition-colors focus-within:ring-2 focus-within:ring-sky-500/40"
                style={{ borderColor: "var(--border)", background: "rgba(6, 11, 20, 0.5)" }}
              >
                <User size={18} className="text-slate-500 shrink-0" />
                <input
                  className="flex-1 py-2.5 bg-transparent outline-none text-white placeholder:text-slate-600"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-300">Password</span>
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-0.5 transition-colors focus-within:ring-2 focus-within:ring-sky-500/40"
                style={{ borderColor: "var(--border)", background: "rgba(6, 11, 20, 0.5)" }}
              >
                <Lock size={18} className="text-slate-500 shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  className="flex-1 py-2.5 bg-transparent outline-none text-white"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                {password ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(password).then(() => {
                        setPasswordCopied(true);
                        setTimeout(() => setPasswordCopied(false), 2000);
                      });
                    }}
                    className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
                    aria-label="Copy password"
                  >
                    {passwordCopied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1 text-slate-500 hover:text-slate-300 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {needsTotp && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-300">Authenticator code</span>
                <input
                  className="w-full rounded-xl border px-3 py-2.5 bg-transparent font-mono tracking-[0.35em] text-center text-lg text-white outline-none focus:ring-2 focus:ring-sky-500/40"
                  style={{ borderColor: "var(--border)", background: "rgba(6, 11, 20, 0.5)" }}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                />
              </label>
            )}

            <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded cursor-pointer w-4 h-4 accent-sky-500"
              />
              <span className="text-slate-400">Remember me on this device</span>
            </label>

            {error && (
              <p
                role="alert"
                className="text-sm rounded-xl px-3 py-2.5 border border-red-500/30"
                style={{ color: "#fecaca", background: "rgba(220, 38, 38, 0.15)" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3.5 font-semibold cursor-pointer disabled:opacity-60 transition-all hover:brightness-110 active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 50%, #fb923c 100%)",
                color: "#fff",
                boxShadow: "0 8px 24px rgba(249, 115, 22, 0.35)",
              }}
            >
              {loading ? "Signing in…" : "Sign in to panel"}
            </button>

            {showDemoLogins && (
              <div
                className="rounded-xl border p-3 space-y-2 text-sm"
                style={{
                  borderColor: "rgba(148, 163, 184, 0.15)",
                  background: "rgba(6, 11, 20, 0.45)",
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                  Demo logins
                </p>
                {DEMO_ACCOUNTS.map((acct) => (
                  <div
                    key={acct.username}
                    className="flex items-center justify-between gap-2 text-slate-400"
                  >
                    <span>
                      <span className="text-slate-300 font-medium">{acct.label}:</span>{" "}
                      <span className="font-mono">
                        {acct.username} / {acct.password}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs shrink-0 px-2 py-0.5 rounded cursor-pointer hover:brightness-110"
                      style={{ color: "var(--logo-accent-a)" }}
                      onClick={() => {
                        setUsername(acct.username);
                        setPassword(acct.password);
                        setError("");
                      }}
                    >
                      Fill
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(community.telegramUrl || community.discordUrl || community.signalUrl) && (
              <div className="flex flex-wrap justify-center gap-3 pt-2 border-t border-slate-700/50 text-xs">
                {community.telegramUrl && (
                  <a href={community.telegramUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                    Telegram
                  </a>
                )}
                {community.discordUrl && (
                  <a href={community.discordUrl} target="_blank" rel="noreferrer" style={{ color: "#5865f2" }} className="hover:underline">
                    Discord
                  </a>
                )}
                {community.signalUrl && (
                  <a href={community.signalUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                    Signal
                  </a>
                )}
              </div>
            )}
          </form>
        </main>
      </div>
    </div>
  );
}
