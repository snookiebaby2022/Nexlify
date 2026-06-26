"use client";

import { MusicIntegrationPage } from "@/components/music-integration-page";
import { musicAddonById } from "@/lib/music-addons-catalog";

export default function YoutubeMusicIntegrationPage() {
  const addon = musicAddonById("youtube_music");
  if (!addon) return null;
  return <MusicIntegrationPage addon={addon} />;
}
