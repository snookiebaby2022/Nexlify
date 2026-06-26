"use client";

import type { AvatarConfig } from "@/lib/avatar-config";

function shade(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  if (n.length !== 6) return hex;
  const r = Math.min(255, Math.max(0, parseInt(n.slice(0, 2), 16) + amount));
  const g = Math.min(255, Math.max(0, parseInt(n.slice(2, 4), 16) + amount));
  const b = Math.min(255, Math.max(0, parseInt(n.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function clayFill(id: string, color: string) {
  const dark = shade(color, -28);
  const light = shade(color, 22);
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor={light} />
      <stop offset="55%" stopColor={color} />
      <stop offset="100%" stopColor={dark} />
    </linearGradient>
  );
}

function Footwear({ config, uid }: { config: AvatarConfig; uid: string }) {
  const useBoots = config.boots !== "none";
  const style = useBoots ? config.boots : config.shoes;
  if (style === "none" && !useBoots) return null;

  const h = useBoots ? 14 : 10;
  const w = useBoots ? 22 : 18;
  const g = `url(#shoe-${uid})`;
  return (
    <>
      <rect x="28" y={118 - h} width={w} height={h} rx="4" fill={g} />
      <rect x="54" y={118 - h} width={w} height={h} rx="4" fill={g} />
    </>
  );
}

function Pants({ config, uid }: { config: AvatarConfig; uid: string }) {
  const y = config.pants === "shorts" ? 78 : 72;
  const h = config.pants === "shorts" ? 28 : 38;
  const g = `url(#pants-${uid})`;
  if (config.pants === "skirt") {
    return (
      <path
        d="M32 72 L68 72 L64 108 L36 108 Z"
        fill={g}
        filter="url(#shadow)"
      />
    );
  }
  return (
    <>
      <rect x="34" y={y} width="14" height={h} rx="3" fill={g} filter="url(#shadow)" />
      <rect x="52" y={y} width="14" height={h} rx="3" fill={g} filter="url(#shadow)" />
    </>
  );
}

function Shirt({ config, uid }: { config: AvatarConfig; uid: string }) {
  const g = `url(#shirt-${uid})`;
  if (config.shirt === "hoodie") {
    return (
      <path
        d="M28 58 Q50 48 72 58 L76 92 Q50 98 24 92 Z"
        fill={g}
        filter="url(#shadow)"
      />
    );
  }
  if (config.shirt === "jacket") {
    return (
      <>
        <rect x="30" y="56" width="40" height="36" rx="6" fill={g} filter="url(#shadow)" />
        <rect x="38" y="56" width="24" height="36" fill="#1f2937" opacity="0.25" rx="4" />
      </>
    );
  }
  return <rect x="32" y="56" width="36" height="34" rx="8" fill={g} filter="url(#shadow)" />;
}

function Eyes({ config }: { config: AvatarConfig }) {
  const acc = config.accessory;
  if (
    acc === "glasses" ||
    acc === "round-glasses" ||
    acc === "thick-glasses" ||
    acc === "sunglasses" ||
    acc === "aviators"
  ) {
    return null;
  }
  const y = 36;
  switch (config.eyes || "round") {
    case "happy":
      return (
        <>
          <path d="M38 36 Q42 32 46 36" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
          <path d="M54 36 Q58 32 62 36" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case "wide":
      return (
        <>
          <ellipse cx="42" cy={y} rx="4" ry="5" fill="#1a1a1a" />
          <ellipse cx="58" cy={y} rx="4" ry="5" fill="#1a1a1a" />
          <circle cx="43" cy={y - 1} r="1.2" fill="#fff" opacity="0.9" />
          <circle cx="59" cy={y - 1} r="1.2" fill="#fff" opacity="0.9" />
        </>
      );
    case "sleepy":
      return (
        <>
          <path d="M38 37 Q42 34 46 37" fill="none" stroke="#1a1a1a" strokeWidth="1.8" />
          <path d="M54 37 Q58 34 62 37" fill="none" stroke="#1a1a1a" strokeWidth="1.8" />
        </>
      );
    case "dots":
      return (
        <>
          <circle cx="42" cy={y} r="2.5" fill="#1a1a1a" />
          <circle cx="58" cy={y} r="2.5" fill="#1a1a1a" />
        </>
      );
    default:
      return (
        <>
          <circle cx="42" cy={y} r="3" fill="#1a1a1a" />
          <circle cx="58" cy={y} r="3" fill="#1a1a1a" />
          <circle cx="43" cy={y - 1} r="1" fill="#fff" />
          <circle cx="59" cy={y - 1} r="1" fill="#fff" />
        </>
      );
  }
}

function Mouth({ config }: { config: AvatarConfig }) {
  switch (config.mouth || "smile") {
    case "neutral":
      return <line x1="44" y1="46" x2="56" y2="46" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" />;
    case "open":
      return <ellipse cx="50" cy="47" rx="5" ry="4" fill="#8b4513" opacity="0.85" />;
    case "smirk":
      return <path d="M44 45 Q52 50 58 44" fill="none" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" />;
    case "laugh":
      return (
        <>
          <path d="M42 44 Q50 52 58 44" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
          <path d="M46 48 Q50 50 54 48" fill="#fff" opacity="0.5" />
        </>
      );
    default:
      return <path d="M44 44 Q50 49 56 44" fill="none" stroke="#1a1a1a" strokeWidth="1.8" strokeLinecap="round" />;
  }
}

function Head({ config, uid }: { config: AvatarConfig; uid: string }) {
  const rx = config.skin === "square" ? 6 : config.skin === "oval" ? 20 : 16;
  const g = `url(#skin-${uid})`;
  return (
    <>
      <ellipse cx="50" cy="54" rx="14" ry="6" fill={g} opacity="0.85" />
      <ellipse cx="50" cy="36" rx={rx + 6} ry="26" fill={g} filter="url(#shadow)" />
      <ellipse cx="42" cy="28" rx="8" ry="5" fill="#fff" opacity="0.14" />
      {config.blush !== false && (
        <>
          <ellipse cx="36" cy="42" rx="5" ry="3" fill="#f9a8d4" opacity="0.45" />
          <ellipse cx="64" cy="42" rx="5" ry="3" fill="#f9a8d4" opacity="0.45" />
        </>
      )}
      <Eyes config={config} />
      <Mouth config={config} />
    </>
  );
}

function Hair({ config, uid }: { config: AvatarConfig; uid: string }) {
  if (config.hair === "none" || config.hair === "bald") return null;
  const g = `url(#hair-${uid})`;
  const c = config.hairColor;
  switch (config.hair) {
    case "long":
      return (
        <path
          d="M32 28 Q50 10 68 28 L70 55 Q50 62 30 55 Z"
          fill={g}
          filter="url(#shadow)"
        />
      );
    case "spiky":
      return (
        <>
          {[38, 44, 50, 56, 62].map((x, i) => (
            <polygon key={i} points={`${x},20 ${x + 5},40 ${x - 5},40`} fill={c} />
          ))}
        </>
      );
    case "ponytail":
      return (
        <>
          <ellipse cx="50" cy="24" rx="22" ry="14" fill={g} />
          <ellipse cx="74" cy="30" rx="9" ry="16" fill={g} />
        </>
      );
    case "curly":
      return (
        <>
          {[34, 42, 50, 58, 66].map((x, i) => (
            <circle key={i} cx={x} cy={22 + (i % 2)} r="7" fill={g} />
          ))}
        </>
      );
    default:
      return <ellipse cx="50" cy="22" rx="24" ry="15" fill={g} filter="url(#shadow)" />;
  }
}

function Hat({ config }: { config: AvatarConfig }) {
  if (config.hat === "none") return null;
  const c = config.hatColor;
  if (config.hat === "cap") {
    return (
      <>
        <ellipse cx="50" cy="20" rx="26" ry="9" fill={c} filter="url(#shadow)" />
        <rect x="58" y="18" width="20" height="5" rx="2" fill={c} />
      </>
    );
  }
  if (config.hat === "beanie") {
    return <ellipse cx="50" cy="18" rx="24" ry="18" fill={c} filter="url(#shadow)" />;
  }
  if (config.hat === "headphones") {
    return (
      <>
        <path d="M26 34 Q50 6 74 34" fill="none" stroke="#374151" strokeWidth="4" />
        <rect x="20" y="32" width="12" height="20" rx="4" fill="#374151" />
        <rect x="68" y="32" width="12" height="20" rx="4" fill="#374151" />
      </>
    );
  }
  return <ellipse cx="50" cy="16" rx="28" ry="11" fill={c} filter="url(#shadow)" />;
}

function Accessory({ config }: { config: AvatarConfig }) {
  const acc = config.accessory;
  if (acc === "round-glasses") {
    return (
      <>
        <circle cx="42" cy="36" r="7" fill="rgba(255,255,255,0.35)" stroke="#f8fafc" strokeWidth="2.5" />
        <circle cx="58" cy="36" r="7" fill="rgba(255,255,255,0.35)" stroke="#f8fafc" strokeWidth="2.5" />
        <line x1="49" y1="36" x2="51" y2="36" stroke="#f8fafc" strokeWidth="2" />
      </>
    );
  }
  if (acc === "thick-glasses") {
    return (
      <>
        <rect x="33" y="30" width="16" height="12" rx="4" fill="none" stroke="#f8fafc" strokeWidth="3" />
        <rect x="51" y="30" width="16" height="12" rx="4" fill="none" stroke="#f8fafc" strokeWidth="3" />
        <line x1="49" y1="36" x2="51" y2="36" stroke="#f8fafc" strokeWidth="2.5" />
      </>
    );
  }
  if (acc === "glasses") {
    return (
      <>
        <circle cx="42" cy="36" r="6" fill="none" stroke="#1a1a1a" strokeWidth="1.8" />
        <circle cx="58" cy="36" r="6" fill="none" stroke="#1a1a1a" strokeWidth="1.8" />
        <line x1="48" y1="36" x2="52" y2="36" stroke="#1a1a1a" strokeWidth="1.8" />
      </>
    );
  }
  if (acc === "sunglasses") {
    return (
      <>
        <rect x="33" y="32" width="15" height="9" rx="3" fill="#111" />
        <rect x="52" y="32" width="15" height="9" rx="3" fill="#111" />
      </>
    );
  }
  if (acc === "aviators") {
    return (
      <path
        d="M32 36 Q42 28 50 36 Q58 28 68 36 L66 40 Q50 44 34 40 Z"
        fill="#374151"
        opacity="0.9"
      />
    );
  }
  if (acc === "tie") {
    return <path d="M48 56 L52 56 L50 78 Z" fill="#dc2626" />;
  }
  if (acc === "scarf") {
    return <rect x="38" y="54" width="24" height="8" rx="3" fill="#ea580c" />;
  }
  if (acc === "necklace") {
    return <ellipse cx="50" cy="54" rx="12" ry="3" fill="none" stroke="#fbbf24" strokeWidth="2" />;
  }
  return null;
}

function configUid(config: AvatarConfig): string {
  let h = 0;
  const s = JSON.stringify(config);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(Math.abs(h) % 1e6);
}

export function AvatarRenderer({
  config,
  size = 120,
  className = "",
  showBackground = true,
}: {
  config: AvatarConfig;
  size?: number;
  className?: string;
  /** When false, background is transparent (for tiles with external colored frame). */
  showBackground?: boolean;
}) {
  const uid = configUid(config);
  const bg = config.backgroundColor || "#e8f4fc";

  return (
    <svg
      viewBox="0 0 100 120"
      width={size}
      height={(size * 120) / 100}
      className={className}
      role="img"
      aria-label="Avatar"
    >
      <defs>
        <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="2" floodOpacity="0.28" />
        </filter>
        <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`bg-depth-${uid}`} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {clayFill(`skin-${uid}`, config.skinTone)}
        {clayFill(`hair-${uid}`, config.hairColor)}
        {clayFill(`shirt-${uid}`, config.shirtColor)}
        {clayFill(`pants-${uid}`, config.pantsColor)}
        {clayFill(`shoe-${uid}`, config.boots !== "none" ? config.bootsColor : config.shoesColor)}
      </defs>
      {showBackground && (
        <>
          <rect width="100" height="120" rx="14" fill={bg} />
          <rect width="100" height="120" rx="14" fill={`url(#bg-depth-${uid})`} />
        </>
      )}
      <ellipse cx="50" cy="116" rx="28" ry="4" fill="#000" opacity="0.12" />
      <Pants config={config} uid={uid} />
      <Footwear config={config} uid={uid} />
      <Shirt config={config} uid={uid} />
      <Head config={config} uid={uid} />
      <Hair config={config} uid={uid} />
      <Hat config={config} />
      <Accessory config={config} />
    </svg>
  );
}
