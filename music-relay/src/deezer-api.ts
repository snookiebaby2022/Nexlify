export type DeezerTrack = {
  id: string;
  name: string;
  previewUrl?: string | null;
  image?: string | null;
};

export async function fetchDeezerPlaylistTracks(playlistId: string): Promise<DeezerTrack[]> {
  const res = await fetch(`https://api.deezer.com/playlist/${playlistId}/tracks`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Deezer playlist HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: { id: number; title?: string; preview?: string; album?: { cover?: string } }[];
  };
  return (data.data ?? [])
    .filter((t) => t.id && t.title)
    .map((t) => ({
      id: String(t.id),
      name: t.title ?? "Deezer track",
      previewUrl: t.preview ?? null,
      image: t.album?.cover ?? null,
    }));
}
