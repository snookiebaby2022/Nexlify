"use client";

import { ExternalImage } from "@/components/external-image";
import { AvatarRenderer } from "@/components/avatar-renderer";
import type { AvatarConfig } from "@/lib/avatar-config";
import { DEFAULT_AVATAR_CONFIG } from "@/lib/avatar-config";
import { avatarConfigFromUsername } from "@/lib/avatar-catalog";

const PALETTE = [
  "#FF4500",
  "#FF8717",
  "#FFD635",
  "#00A368",
  "#7EED56",
  "#0DD3BB",
  "#24A0ED",
  "#4856A9",
  "#C33764",
  "#FF66AC",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsFromUsername(username: string): string {
  const parts = username.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  const u = username.trim();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  return (u.charAt(0) || "?").toUpperCase();
}

export function avatarColorForUsername(username: string): string {
  return PALETTE[hashString(username.toLowerCase()) % PALETTE.length];
}

/** Reddit-style: photo, character SVG, or colored initials. */
export function UserAvatar({
  username,
  photoUrl,
  avatarConfig,
  size = 32,
  className = "",
}: {
  username: string;
  photoUrl?: string | null;
  avatarConfig?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  if (photoUrl?.trim()) {
    return (
      <ExternalImage
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const characterConfig = avatarConfig ?? avatarConfigFromUsername(username);

  if (characterConfig && !photoUrl?.trim()) {
    const ring = avatarColorForUsername(username);
    return (
      <span
        className={`inline-flex items-center justify-center rounded-2xl shrink-0 p-[3px] ${className}`}
        style={{
          width: size,
          height: size,
          background: `linear-gradient(145deg, ${ring} 0%, ${ring}66 40%, #1e293b 100%)`,
          boxShadow: `0 4px 14px ${ring}44, 0 0 0 1px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.35)`,
        }}
        title={username}
      >
        <span
          className="rounded-xl overflow-hidden flex items-end justify-center"
          style={{
            width: size - 6,
            height: size - 6,
            background: `linear-gradient(180deg, ${characterConfig.backgroundColor} 0%, ${characterConfig.backgroundColor}dd 100%)`,
          }}
        >
          <AvatarRenderer
            config={characterConfig}
            size={size - 8}
            showBackground={false}
          />
        </span>
      </span>
    );
  }

  const initials = initialsFromUsername(username);
  const bg = avatarColorForUsername(username);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size < 36 ? 11 : 13,
        background: bg,
        boxShadow: `inset 0 -2px 0 rgba(0,0,0,0.15), 0 0 0 2px rgba(255,255,255,0.25)`,
        letterSpacing: "0.02em",
      }}
      title={username}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function defaultNavAvatarConfig(): AvatarConfig {
  return DEFAULT_AVATAR_CONFIG;
}
