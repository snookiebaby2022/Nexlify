import { AnimatedAvatar } from "@/components/AnimatedAvatar";

const INTEGRATIONS = [
  {
    icon: "P",
    accent: "from-amber-500 to-orange-600",
    motion: "float" as const,
    delay: 0,
    className: "absolute right-4 top-6 lg:right-8",
    size: "lg" as const,
  },
  {
    icon: "♫",
    accent: "from-green-500 to-emerald-600",
    motion: "float-slow" as const,
    delay: 0.8,
    className: "absolute right-28 top-0 lg:right-36",
    size: "md" as const,
  },
  {
    icon: "▶",
    accent: "from-red-500 to-rose-600",
    motion: "wobble" as const,
    delay: 1.2,
    className: "absolute right-0 top-28 lg:right-2",
    size: "md" as const,
  },
  {
    icon: "E",
    accent: "from-emerald-500 to-teal-600",
    motion: "float-slow" as const,
    delay: 0.4,
    className: "absolute right-20 top-24 lg:right-28",
    size: "sm" as const,
  },
  {
    icon: "J",
    accent: "from-violet-500 to-purple-700",
    motion: "float" as const,
    delay: 1.6,
    className: "absolute right-36 top-20 lg:right-48",
    size: "sm" as const,
  },
  {
    icon: "★",
    accent: "from-violet-600 via-fuchsia-500 to-amber-500",
    motion: "pulse" as const,
    delay: 0,
    className: "absolute right-14 top-44 lg:right-20",
    size: "xl" as const,
    ring: true,
  },
];

export function HeroAvatars() {
  return (
    <div
      className="relative mx-auto mt-12 h-56 w-full max-w-sm sm:max-w-md lg:mx-0 lg:mt-0 lg:h-80 lg:w-80 lg:max-w-none"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-0 rounded-full bg-violet-600/10 blur-3xl animate-avatar-glow-bg" />
      {INTEGRATIONS.map((item) => (
        <AnimatedAvatar
          key={item.icon + item.className}
          accent={item.accent}
          size={item.size}
          motion={item.motion}
          delay={item.delay}
          ring={item.ring}
          className={item.className}
        >
          {item.icon}
        </AnimatedAvatar>
      ))}
    </div>
  );
}
