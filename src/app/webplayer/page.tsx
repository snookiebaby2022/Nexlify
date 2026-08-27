"use client";

import dynamic from "next/dynamic";

const PanelWebPlayer = dynamic(
  () => import("@/components/panel-web-player").then((m) => ({ default: m.PanelWebPlayer })),
  { ssr: false }
);

export default function WebPlayerPage() {
  return <PanelWebPlayer />;
}
