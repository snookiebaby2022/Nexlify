import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Nexlify — IPTV Panel for Worldwide Resellers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px",
          background: "linear-gradient(135deg, #080612 0%, #1a0a3e 50%, #0f172a 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: "#a78bfa",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Nexlify · Worldwide
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, marginTop: 24, lineHeight: 1.1, maxWidth: 900 }}>
          IPTV Panel & WHMCS Billing
        </div>
        <div style={{ fontSize: 28, marginTop: 24, color: "#94a3b8", maxWidth: 800, lineHeight: 1.4 }}>
          Best reseller panel · Live demo · 7-day trial · GBP & USD checkout
        </div>
      </div>
    ),
    { ...size },
  );
}
