export type MusicAddonId = "spotify" | "apple_music" | "deezer" | "youtube_music";

export type MusicAddonDef = {
  id: MusicAddonId;
  name: string;
  description: string;
  docsUrl: string;
  color: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
};

export const MUSIC_ADDONS: MusicAddonDef[] = [
  {
    id: "spotify",
    name: "Spotify",
    description:
      "Spotify playlist import. Use Client ID + Secret and a Refresh token for full-length streams (relay is automatic on Nexlify-hosted panels).",
    docsUrl: "https://developer.spotify.com/documentation/web-api",
    color: "#1DB954",
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "Spotify app client id" },
      { key: "clientSecret", label: "Client Secret", placeholder: "Spotify app secret", secret: true },
      { key: "refreshToken", label: "Refresh token", placeholder: "Required for private playlists + full relay", secret: true },
      { key: "playlistUri", label: "Playlist URI", placeholder: "spotify:playlist:…" },
      {
        key: "relayUrl",
        label: "Stream relay URL (optional)",
        placeholder: "Leave blank — uses panel MUSIC_RELAY_BASE_URL",
      },
    ],
  },
  {
    id: "apple_music",
    name: "Apple Music",
    description:
      "Apple Music via MusicKit developer token. Catalog import works with Team/Key/.p8; full playback uses the built-in relay.",
    docsUrl: "https://developer.apple.com/documentation/applemusicapi",
    color: "#FA243C",
    fields: [
      { key: "teamId", label: "Team ID", placeholder: "Apple Developer team id" },
      { key: "keyId", label: "Key ID", placeholder: "MusicKit key id" },
      { key: "privateKey", label: "Private key (.p8)", placeholder: "Paste .p8 contents", secret: true },
      { key: "storefront", label: "Storefront", placeholder: "us" },
      { key: "playlistId", label: "Playlist ID", placeholder: "Apple Music catalog playlist id" },
      {
        key: "relayUrl",
        label: "Stream relay URL (optional)",
        placeholder: "Leave blank — uses panel MUSIC_RELAY_BASE_URL",
      },
    ],
  },
  {
    id: "deezer",
    name: "Deezer",
    description:
      "Deezer playlist import. Set DEEZER_ARL on the relay host for full-length streams (relay URL is automatic on Nexlify-hosted panels).",
    docsUrl: "https://developers.deezer.com/",
    color: "#A238FF",
    fields: [
      { key: "appId", label: "Application ID", placeholder: "Deezer app id" },
      { key: "appSecret", label: "Application secret", placeholder: "Deezer secret", secret: true },
      { key: "playlistId", label: "Playlist ID", placeholder: "Numeric playlist id" },
      {
        key: "relayUrl",
        label: "Stream relay URL (optional)",
        placeholder: "Leave blank — uses panel MUSIC_RELAY_BASE_URL",
      },
    ],
  },
  {
    id: "youtube_music",
    name: "YouTube Music",
    description:
      "YouTube Music via YouTube Data API or relay URL. Pair with yt-dlp on a stream server for playback.",
    docsUrl: "https://developers.google.com/youtube/v3",
    color: "#FF0000",
    fields: [
      { key: "apiKey", label: "API key", placeholder: "YouTube Data API key", secret: true },
      { key: "channelId", label: "Channel / playlist ID", placeholder: "UC… or playlist id" },
      { key: "relayUrl", label: "Relay HLS URL", placeholder: "https://server/live/ytmusic.m3u8" },
    ],
  },
];

export function musicAddonById(id: string): MusicAddonDef | undefined {
  return MUSIC_ADDONS.find((m) => m.id === id);
}

export function musicAddonHref(id: MusicAddonId): string {
  return `/admin/integrations/${id.replace(/_/g, "-")}`;
}
