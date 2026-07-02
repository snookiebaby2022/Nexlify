import { PanelRole } from "@prisma/client";
import { isPanelAdmin } from "@/lib/owner-scope";

type JsonRecord = Record<string, unknown>;

function redactProvider(provider: unknown) {
  if (!provider || typeof provider !== "object") return provider;
  const p = provider as JsonRecord;
  return {
    id: p.id,
    name: p.name,
    providerType: p.providerType,
  };
}

function redactServer(server: unknown) {
  if (!server || typeof server !== "object") return server;
  const s = server as JsonRecord;
  return { id: s.id, name: s.name };
}

/** Strip upstream URLs, provider credentials, and server infra from stream payloads for non-admin roles. */
export function redactStream<T>(stream: T, role: PanelRole): T {
  if (isPanelAdmin(role)) return stream;

  const out = { ...(stream as JsonRecord) };
  out.streamUrl = "";
  out.playlistUrl = null;
  out.providerPath = null;
  out.dnsRotator = null;
  out.agentStartCmd = null;
  out.lastProbeError = null;

  if ("provider" in out) out.provider = redactProvider(out.provider);
  if ("server" in out) out.server = redactServer(out.server);

  return out as T;
}

export function redactStreams<T>(streams: T[], role: PanelRole): T[] {
  return streams.map((s) => redactStream(s, role));
}
