"use client";

import { useState } from "react";

export default function ResizeToolPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [width, setWidth] = useState(256);
  const [height, setHeight] = useState(256);

  function onFile(file: File | undefined) {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(16, width);
      canvas.height = Math.max(16, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setPreview(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Resize logos / thumbnails</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Resize a channel logo or VOD poster in the browser, then download the PNG.
      </p>
      <div className="flex gap-3 items-end">
        <label className="text-sm">
          Width
          <input
            type="number"
            className="block mt-1 rounded border px-2 py-1 w-24"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value) || 256)}
          />
        </label>
        <label className="text-sm">
          Height
          <input
            type="number"
            className="block mt-1 rounded border px-2 py-1 w-24"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value) || 256)}
          />
        </label>
        <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {preview && (
        <div className="space-y-3">
          <img src={preview} alt="Resized preview" className="border rounded max-w-full" />
          <a href={preview} download="resized.png" className="text-sm" style={{ color: "var(--accent)" }}>
            Download PNG
          </a>
        </div>
      )}
    </div>
  );
}
