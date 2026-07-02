"use client";

import { MusicIntegrationPage } from "@/components/music-integration-page";
import { musicAddonById } from "@/lib/music-addons-catalog";

export default function SpotifyIntegrationPage() {
  const addon = musicAddonById("spotify");
  if (!addon) return null;
  return <MusicIntegrationPage addon={addon} />;
}
