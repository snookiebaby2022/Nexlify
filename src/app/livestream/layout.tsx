import type { ReactNode } from "react";

export default function LivestreamLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`html, body { overflow: hidden !important; height: 100%; overscroll-behavior: none; }`}</style>
      {children}
    </>
  );
}
