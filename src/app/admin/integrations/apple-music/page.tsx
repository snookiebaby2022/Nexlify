"use client";

import { MusicIntegrationPage } from "@/components/music-integration-page";
import { musicAddonById } from "@/lib/music-addons-catalog";

export default function AppleMusicIntegrationPage() {
  const addon = musicAddonById("apple_music");
  if (!addon) return null;
  return <MusicIntegrationPage addon={addon} />;
}
