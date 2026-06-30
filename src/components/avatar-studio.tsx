"use client";

import { useMemo, useState } from "react";
import { Pencil, Shuffle, X } from "lucide-react";
import type { AvatarConfig } from "@/lib/avatar-config";
import { DEFAULT_AVATAR_CONFIG } from "@/lib/avatar-config";
import { AVATAR_PRESETS, randomAvatarConfig } from "@/lib/avatar-catalog";
import { AvatarCustomizer } from "@/components/avatar-customizer";
import { AvatarRenderer } from "@/components/avatar-renderer";
import { AnimatedAvatarFrame, animatedAvatarSize } from "@/components/animated-avatar-frame";

type AvatarStudioProps = {
  config: AvatarConfig;
  onChange: (c: AvatarConfig) => void;
  username?: string;
  usernameHint?: string;
};

export function AvatarStudio({
  config,
  onChange,
  username,
  usernameHint = "Your username appears in-game and on your community profile.",
}: AvatarStudioProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const gridPresets = useMemo(() => AVATAR_PRESETS, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <AnimatedAvatarFrame backgroundColor={config.backgroundColor} size="lg">
            <AvatarRenderer config={config} size={animatedAvatarSize("lg")} showBackground={false} />
          </AnimatedAvatarFrame>
          <button
            type="button"
            title="Customize avatar"
            onClick={() => setEditorOpen(true)}
            className="absolute -bottom-1 -right-1 min-w-11 h-11 px-3 rounded-full flex items-center justify-center gap-1 shadow-lg cursor-pointer border-2 border-white text-xs font-semibold"
            style={{ background: "linear-gradient(135deg, #ff4500, #ea580c)", color: "#fff" }}
          >
            <Pencil size={16} />
            Edit
          </button>
        </div>

        {username != null && (
          <div className="w-full max-w-md space-y-2">
            <div
              className="flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            >
              <span className="flex-1 truncate">{username || "Username"}</span>
            </div>
            <p className="text-xs text-center px-2" style={{ color: "var(--muted)" }}>
              {usernameHint}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)",
              color: "#fff",
            }}
          >
            Customize
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-full px-5 py-2.5 text-sm font-semibold cursor-pointer"
            style={{ background: "#1e293b", color: "#fff" }}
          >
            Choose preset
          </button>
          <button
            type="button"
            onClick={() => onChange(randomAvatarConfig())}
            className="rounded-full px-4 py-2.5 text-sm font-medium border cursor-pointer inline-flex items-center gap-2"
            style={{ borderColor: "var(--border)" }}
          >
            <Shuffle size={16} />
            Randomize
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[320px] overflow-y-auto">
        {gridPresets.map((p) => (
          <button
            key={`tile-${p.id}`}
            type="button"
            onClick={() => onChange(p.config)}
            className="aspect-square rounded-2xl p-1.5 cursor-pointer hover:scale-[1.03] transition-transform overflow-hidden"
            style={{ background: p.config.backgroundColor }}
            title={p.label}
          >
            <AvatarRenderer config={p.config} size={56} showBackground={false} className="mx-auto" />
          </button>
        ))}
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border flex flex-col"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-semibold">Choose avatar</span>
              <button
                type="button"
                className="p-2 cursor-pointer rounded-full hover:opacity-80"
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-3 gap-3">
              {AVATAR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.config);
                    setPickerOpen(false);
                  }}
                  className="rounded-2xl p-2 cursor-pointer text-left hover:ring-2 ring-[#ff4500]"
                  style={{ background: p.config.backgroundColor }}
                >
                  <AvatarRenderer config={p.config} size={72} showBackground={false} className="mx-auto" />
                  <div className="text-xs font-medium mt-2 text-center text-white drop-shadow-sm">
                    {p.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button
                type="button"
                className="text-sm px-4 py-2 rounded-full font-semibold cursor-pointer shadow-md"
                style={{
                  background: "linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)",
                  color: "#fff",
                }}
                onClick={() => setEditorOpen(false)}
              >
                Done editing
              </button>
            </div>
            <AvatarCustomizer
              initial={config}
              onChange={(c) => {
                onChange(c);
              }}
            />
            <div className="flex gap-2 mt-3 justify-end">
              <button
                type="button"
                className="text-xs underline cursor-pointer"
                style={{ color: "var(--muted)" }}
                onClick={() => onChange(DEFAULT_AVATAR_CONFIG)}
              >
                Reset to default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
