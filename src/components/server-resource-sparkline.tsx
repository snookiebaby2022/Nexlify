"use client";

import { useEffect, useRef } from "react";

function drawSparkline(canvas: HTMLCanvasElement, values: number[], color: string, maxVal: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx || values.length < 2) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const max = maxVal || Math.max(...values, 1);
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h * 0.9 - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function Sparkline({
  values,
  color,
  max,
  label,
}: {
  values: number[];
  color: string;
  max: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawSparkline(ref.current, values, color, max);
  }, [values, color, max]);
  const current = values[values.length - 1] ?? 0;
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-lg font-bold mb-2" style={{ color }}>
        {current.toFixed(1)}%
      </div>
      {values.length < 2 ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Collecting samples…
        </p>
      ) : (
        <canvas ref={ref} width={300} height={60} className="w-full" />
      )}
    </div>
  );
}
