"use client";

import { useEffect, useState } from "react";
import type { AvatarConfig } from "@/lib/avatar-config";
import { DEFAULT_AVATAR_CONFIG } from "@/lib/avatar-config";
import {
  ACCESSORY_STYLES,
  AVATAR_PRESETS,
  BACKGROUND_COLORS,
  BOOT_STYLES,
  CLOTHING_COLORS,
  CUSTOMIZER_TABS,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HAT_STYLES,
  MOUTH_STYLES,
  PANTS_STYLES,
  SHIRT_STYLES,
  SHOE_STYLES,
  SKIN_STYLES,
  SKIN_TONES,
} from "@/lib/avatar-catalog";
import { AvatarRenderer } from "@/components/avatar-renderer";
import { AnimatedAvatarFrame, animatedAvatarSize } from "@/components/animated-avatar-frame";

function OptionGrid<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: string;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className="rounded-full px-3 py-1.5 text-xs cursor-pointer border capitalize"
            style={{
              borderColor: value === opt ? "#ff4500" : "var(--border)",
              background: value === opt ? "rgba(255,69,0,0.12)" : "var(--bg-card)",
              color: value === opt ? "#ff4500" : "inherit",
            }}
          >
            {opt.replace(/-/g, " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className="w-8 h-8 rounded-full border-2 cursor-pointer transition-transform hover:scale-110"
            style={{
              background: c,
              borderColor: value === c ? "#ff4500" : "var(--border)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function AvatarCustomizer({
  initial,
  onChange,
}: {
  initial?: AvatarConfig | null;
  onChange: (config: AvatarConfig) => void;
}) {
  const [config, setConfig] = useState<AvatarConfig>(initial ?? DEFAULT_AVATAR_CONFIG);
  const [tab, setTab] = useState<(typeof CUSTOMIZER_TABS)[number]["id"]>("outfits");

  useEffect(() => {
    if (initial) setConfig(initial);
  }, [initial]);

  function update(patch: Partial<AvatarConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    onChange(next);
  }

  return (
    <div
      className="flex flex-col lg:flex-row gap-0 rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
    >
      <div className="lg:w-[280px] shrink-0 flex flex-col items-center justify-center p-6 gap-4">
        <AnimatedAvatarFrame backgroundColor={config.backgroundColor} size="lg">
          <AvatarRenderer config={config} size={animatedAvatarSize("lg")} showBackground={false} />
        </AnimatedAvatarFrame>
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          Live preview
        </p>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="flex gap-0 overflow-x-auto border-b text-xs font-semibold"
          style={{ borderColor: "var(--border)" }}
        >
          {CUSTOMIZER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="px-4 py-3 whitespace-nowrap cursor-pointer border-b-2 transition-colors"
              style={{
                borderColor: tab === t.id ? "#ff4500" : "transparent",
                color: tab === t.id ? "#ff4500" : "var(--muted)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 max-h-[420px] overflow-y-auto">
          {tab === "outfits" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {AVATAR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setConfig(p.config);
                    onChange(p.config);
                  }}
                  className="rounded-lg border p-2 cursor-pointer hover:opacity-90 text-left"
                  style={{
                    borderColor: "var(--border)",
                    background: p.config.backgroundColor,
                  }}
                >
                  <div className="flex justify-center">
                    <AvatarRenderer config={p.config} size={72} showBackground={false} />
                  </div>
                  <div className="text-xs font-medium mt-2 text-center">{p.label}</div>
                </button>
              ))}
            </div>
          )}
          {tab === "tops" && (
            <>
              <OptionGrid label="Top style" options={SHIRT_STYLES} value={config.shirt} onChange={(v) => update({ shirt: v })} />
              <ColorRow label="Top color" colors={CLOTHING_COLORS} value={config.shirtColor} onChange={(v) => update({ shirtColor: v })} />
            </>
          )}
          {tab === "bottoms" && (
            <>
              <OptionGrid label="Bottoms" options={PANTS_STYLES} value={config.pants} onChange={(v) => update({ pants: v })} />
              <ColorRow label="Bottom color" colors={CLOTHING_COLORS} value={config.pantsColor} onChange={(v) => update({ pantsColor: v })} />
              <OptionGrid label="Shoes" options={SHOE_STYLES} value={config.shoes} onChange={(v) => update({ shoes: v })} />
              <ColorRow label="Shoe color" colors={CLOTHING_COLORS} value={config.shoesColor} onChange={(v) => update({ shoesColor: v })} />
              <OptionGrid label="Boots" options={BOOT_STYLES} value={config.boots} onChange={(v) => update({ boots: v })} />
              <ColorRow label="Boot color" colors={CLOTHING_COLORS} value={config.bootsColor} onChange={(v) => update({ bootsColor: v })} />
            </>
          )}
          {tab === "hair" && (
            <>
              <OptionGrid label="Hair style" options={HAIR_STYLES} value={config.hair} onChange={(v) => update({ hair: v })} />
              <ColorRow label="Hair color" colors={HAIR_COLORS} value={config.hairColor} onChange={(v) => update({ hairColor: v })} />
            </>
          )}
          {tab === "face" && (
            <>
              <OptionGrid label="Face shape" options={SKIN_STYLES} value={config.skin} onChange={(v) => update({ skin: v })} />
              <ColorRow label="Skin tone" colors={SKIN_TONES} value={config.skinTone} onChange={(v) => update({ skinTone: v })} />
            </>
          )}
          {tab === "eyes" && (
            <OptionGrid
              label="Eye style"
              options={EYE_STYLES}
              value={config.eyes || "round"}
              onChange={(v) => update({ eyes: v })}
            />
          )}
          {tab === "mouth" && (
            <OptionGrid
              label="Mouth"
              options={MOUTH_STYLES}
              value={config.mouth || "smile"}
              onChange={(v) => update({ mouth: v })}
            />
          )}
          {tab === "extras" && (
            <>
              <OptionGrid
                label="Eyewear & accessories"
                options={ACCESSORY_STYLES}
                value={config.accessory}
                onChange={(v) => update({ accessory: v })}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.blush !== false}
                  onChange={(e) => update({ blush: e.target.checked })}
                />
                Rosy cheeks
              </label>
            </>
          )}
          {tab === "hats" && (
            <>
              <OptionGrid label="Hat" options={HAT_STYLES} value={config.hat} onChange={(v) => update({ hat: v })} />
              <ColorRow label="Hat color" colors={CLOTHING_COLORS} value={config.hatColor} onChange={(v) => update({ hatColor: v })} />
            </>
          )}
          {tab === "background" && (
            <ColorRow
              label="Background"
              colors={BACKGROUND_COLORS}
              value={config.backgroundColor}
              onChange={(v) => update({ backgroundColor: v })}
            />
          )}
          <button
            type="button"
            className="text-xs underline cursor-pointer"
            style={{ color: "var(--muted)" }}
            onClick={() => {
              setConfig(DEFAULT_AVATAR_CONFIG);
              onChange(DEFAULT_AVATAR_CONFIG);
            }}
          >
            Reset to default
          </button>
        </div>
      </div>
    </div>
  );
}
