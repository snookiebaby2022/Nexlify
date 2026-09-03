/** Queue an agent restart for one live stream. Never kills nginx / :8080. */
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
