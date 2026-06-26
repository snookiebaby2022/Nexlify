export type AvatarConfig = {
  skin: string;
  skinTone: string;
  hair: string;
  hairColor: string;
  eyes: string;
  mouth: string;
  blush: boolean;
  shirt: string;
  shirtColor: string;
  pants: string;
  pantsColor: string;
  shoes: string;
  shoesColor: string;
  boots: string;
  bootsColor: string;
  hat: string;
  hatColor: string;
  accessory: string;
  backgroundColor: string;
};

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skin: "round",
  skinTone: "#f5c6a5",
  hair: "short",
  hairColor: "#3d2314",
  eyes: "round",
  mouth: "smile",
  blush: true,
  shirt: "tee",
  shirtColor: "#2563eb",
  pants: "jeans",
  pantsColor: "#1e3a5f",
  shoes: "sneakers",
  shoesColor: "#ffffff",
  boots: "none",
  bootsColor: "#4a3728",
  hat: "none",
  hatColor: "#1f2937",
  accessory: "none",
  backgroundColor: "#e8f4fc",
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_AVATAR_CONFIG));

export function parseAvatarConfig(raw: unknown): AvatarConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR_CONFIG };
  for (const key of ALLOWED_KEYS) {
    if (src[key] == null) continue;
    if (key === "blush") {
      out.blush = src[key] === true || src[key] === "true";
      continue;
    }
    (out as Record<string, string | boolean>)[key] = String(src[key]);
  }
  return out;
}

export function avatarConfigEqual(a: AvatarConfig, b: AvatarConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
