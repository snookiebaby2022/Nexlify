import type { ReactNode } from "react";

type AvatarSize = "sm" | "md" | "lg" | "xl";
type AvatarMotion = "float" | "float-slow" | "wobble" | "pulse" | "none";

const SIZES: Record<AvatarSize, string> = {
  sm: "h-10 w-10 text-sm rounded-xl",
  md: "h-14 w-14 text-xl rounded-2xl",
  lg: "h-16 w-16 text-2xl rounded-2xl",
  xl: "h-20 w-20 text-3xl rounded-3xl",
};

const MOTION: Record<Exclude<AvatarMotion, "none">, string> = {
  float: "animate-avatar-float",
  "float-slow": "animate-avatar-float-slow",
  wobble: "animate-avatar-wobble",
  pulse: "animate-avatar-pulse",
};

export function AnimatedAvatar({
  children,
  accent = "from-violet-500 to-fuchsia-600",
  size = "md",
  motion = "float",
  delay = 0,
  ring = false,
  className = "",
}: {
  children: ReactNode;
  accent?: string;
  size?: AvatarSize;
  motion?: AvatarMotion;
  delay?: number;
  ring?: boolean;
  className?: string;
}) {
  const motionClass = motion === "none" ? "" : MOTION[motion];

  return (
    <div
      className={`relative inline-flex shrink-0 ${className}`}
      style={motion !== "none" ? { animationDelay: `${delay}s` } : undefined}
    >
      {ring && (
        <span
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-30 ${SIZES[size].split(" ").filter((c) => c.startsWith("rounded")).join(" ")} animate-avatar-ring`}
          aria-hidden
        />
      )}
      <span
        className={`relative flex items-center justify-center bg-gradient-to-br font-bold text-white shadow-lg transition-transform duration-300 group-hover:scale-110 ${accent} ${SIZES[size]} ${motionClass}`}
      >
        {children}
      </span>
    </div>
  );
}
