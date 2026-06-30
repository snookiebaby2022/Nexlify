"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDate } from "@/lib/format";

type Signup = { email: string; signedUpAt: string };

export function AdminNewsletter() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [storage, setStorage] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/newsletter")
      .then((r) => r.json())
      .then((d) => {
        setSignups(d.signups ?? []);
        setStorage(d.storage ?? "unknown");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-slate-400 text-sm">Loading signups…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-white">Newsletter signups</h2>
        <p className="text-sm text-[var(--muted)]">
          {signups.length} unique emails · storage: {storage}
          {storage === "webhook" && " (webhook only — local log may be empty)"}
        </p>
      </div>

      {signups.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No signups in local log. If NEWSLETTER_WEBHOOK_URL is set, signups go to the webhook.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b border-slate-800 bg-slate-900/95 text-slate-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.email} className="border-b border-slate-800/80">
                  <td className="px-4 py-3 text-white">{s.email}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(s.signedUpAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
