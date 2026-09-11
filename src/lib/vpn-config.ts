export type VpnKind = "WIREGUARD" | "OPENVPN";

const PLACEHOLDER_PATTERNS = [
  /insert_your/i,
  /your_private_key/i,
  /<replace/i,
  /changeme/i,
  /example\.com/i,
  /xxx+/i,
];

export function detectVpnKindFromConfig(text: string): VpnKind {
  const t = String(text || "");
  if (/^\s*client\s/m.test(t) || /^\s*dev\s+tun/m.test(t) || /^\s*remote\s+/m.test(t)) {
    return "OPENVPN";
  }
  if (/^\s*\[Interface\]/im.test(t) || /^\s*\[Peer\]/im.test(t)) {
    return "WIREGUARD";
  }
  return "WIREGUARD";
}

export function detectVpnKindFromFilename(filename: string): VpnKind | null {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".ovpn")) return "OPENVPN";
  if (lower.endsWith(".conf") || lower.endsWith(".wg")) return null;
  return null;
}

export function mergeVpnKind(filename: string, text: string, explicit?: string): VpnKind {
  const fromName = detectVpnKindFromFilename(filename);
  if (fromName) return fromName;
  if (explicit === "OPENVPN" || explicit === "WIREGUARD") return explicit;
  return detectVpnKindFromConfig(text);
}

export function validateVpnConfigText(
  kind: VpnKind,
  text: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const body = String(text || "").trim();
  if (!body) {
    errors.push("Config is empty");
    return { valid: false, errors };
  }
  if (body.length < 32) {
    errors.push("Config looks too short");
  }
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(body)) {
      errors.push("Config still contains placeholder text — paste your real provider config");
      break;
    }
  }
  if (kind === "WIREGUARD") {
    if (!/^\s*\[Interface\]/im.test(body)) {
      errors.push("WireGuard config must include an [Interface] section");
    }
    if (!/PrivateKey\s*=/i.test(body)) {
      errors.push("WireGuard config must include PrivateKey = …");
    }
  } else {
    if (!/^\s*(client|dev\s+tun|remote\s+)/im.test(body)) {
      errors.push("OpenVPN config should include client, dev tun, or remote directives");
    }
  }
  return { valid: errors.length === 0, errors };
}
