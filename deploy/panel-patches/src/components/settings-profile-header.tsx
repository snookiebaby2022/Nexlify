"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { parseAvatarConfig } from "@/lib/avatar-config";

export function SettingsProfileHeader() {
  const [user, setUser] = useState<{
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    avatarConfig: unknown;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setUser(d.user);
      });
  }, []);

  if (!user) return null;

  const avatarConfig = parseAvatarConfig(user.avatarConfig);

  return (
    <div
      className="mb-6 flex items-center gap-4 rounded-lg border p-4"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <UserAvatar
        username={user.username}
        photoUrl={user.avatarUrl}
        avatarConfig={avatarConfig}
        size={56}
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{user.displayName || user.username}</div>
        <div className="text-sm truncate" style={{ color: "var(--muted)" }}>
          @{user.username}
        </div>
      </div>
      <Link
        href="/admin/profile"
        className="text-sm px-3 py-2 rounded-md shrink-0"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Edit avatar
      </Link>
    </div>
  );
}
