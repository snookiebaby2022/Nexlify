"use client";

const MP4_URL = "/promo/nexlify-tiktok-ad.mp4";
const LICENSE_URL = "https://nexlify.live/pricing";

export function TikTokSellAd() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 bg-[#060b14] px-4 py-8 text-white"
      style={{ height: "100dvh", width: "100vw" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">Nexlify · TikTok promo</p>

      <video
        src={MP4_URL}
        controls
        playsInline
        autoPlay
        muted
        loop
        className="w-full max-w-[min(100vw,400px)] rounded-2xl shadow-2xl"
        style={{ maxHeight: "72dvh", aspectRatio: "9/16", objectFit: "cover" }}
      />

      <a
        href={MP4_URL}
        download="nexlify-tiktok-ad.mp4"
        className="inline-flex w-full max-w-[min(100vw,400px)] items-center justify-center rounded-2xl py-4 text-base font-bold text-white"
        style={{
          background: "linear-gradient(135deg, #f97316, #ea580c)",
          boxShadow: "0 12px 40px rgba(249,115,22,0.4)",
        }}
      >
        Download MP4
      </a>

      <a href={LICENSE_URL} className="text-sm text-cyan-400 hover:underline">
        Get your license → nexlify.live
      </a>
    </div>
  );
}
