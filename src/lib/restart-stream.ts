/** Restart a live stream. Relay streams drop edge fan + auth cache; transcode queues agent ffmpeg. */
export async function restartStreamOnServer(
  serverId: string,
  streamId: string
): Promise<string | null> {
  const res = await fetch(`/api/admin/servers/${encodeURIComponent(serverId)}/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restart_stream", streamId }),
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Restart failed";
}
