import type { ReactNode } from "react";

const SIZES = {
  sm: { box: 100, pad: 8, avatar: 76 },
  md: { box: 140, pad: 12, avatar: 108 },
  lg: { box: 220, pad: 20, avatar: 180 },
} as const;

export function AnimatedAvatarFrame({
  children,
  backgroundColor = "#e8f4fc",
  size = "lg",
  className = "",
}: {
  children: ReactNode;
  backgroundColor?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className="rounded-3xl avatar-studio-card flex items-end justify-center"
        style={{
          width: s.box,
          height: s.box,
          padding: s.pad,
          background: `linear-gradient(160deg, ${backgroundColor} 0%, #0f172a 120%)`,
          boxShadow:
            "0 16px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        <div className="avatar-studio-preview flex items-end justify-center w-full">
          <div className="avatar-studio-character">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function animatedAvatarSize(size: keyof typeof SIZES) {
  return SIZES[size].avatar;
}
