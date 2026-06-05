"use client";

import { MusicIntegrationPage } from "@/components/music-integration-page";
import { musicAddonById } from "@/lib/music-addons-catalog";

export default function DeezerIntegrationPage() {
  const addon = musicAddonById("deezer");
  if (!addon) return null;
  return <MusicIntegrationPage addon={addon} />;
}
