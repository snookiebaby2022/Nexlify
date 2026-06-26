import { site } from "@/lib/site";

export const PANEL_INSTALL_SCRIPT_URL = `${site.url}/install/panel.sh`;

export type InstallCommandOptions = {
  domain?: string;
  email?: string;
  license?: string;
};

function shellArg(value: string): string {
  return value.replace(/'/g, "'\\''");
}

export function buildInstallCommand(opts: InstallCommandOptions = {}): string {
  const domain = opts.domain?.trim();
  const email = opts.email?.trim();
  const license = opts.license?.trim();

  const args: string[] = [];
  if (domain) args.push(`--domain '${shellArg(domain)}'`);
  if (email) args.push(`--email '${shellArg(email)}'`);
  if (license) args.push(`--license '${shellArg(license)}'`);

  if (args.length === 0) {
    return `curl -fsSL ${PANEL_INSTALL_SCRIPT_URL} | sudo bash`;
  }

  return `curl -fsSL ${PANEL_INSTALL_SCRIPT_URL} | sudo bash -s -- ${args.join(" ")}`;
}

export const INSTALL_REQUIREMENTS = [
  "Fresh Ubuntu 22.04+ or Debian 11+ VPS",
  "Root or sudo access",
  "Public hostname pointed at the server (for HTTPS)",
  "2 GB RAM minimum (4 GB recommended)",
  "Ports 22, 80, and 443 open",
] as const;

export const INSTALL_INCLUDES = [
  "Node.js 22, PM2, PostgreSQL, Redis, nginx, ffmpeg",
  "Panel download, build, database seed, and PM2 service",
  "nginx reverse proxy on your domain",
  "Optional Let's Encrypt SSL (with --email)",
  "License key pre-filled when you pass --license",
  "Admin credentials saved to .install-credentials on the server",
] as const;

export type InstallStep = {
  title: string;
  body: string;
  code?: string;
};

export const INSTALL_STEPS: InstallStep[] = [
  {
    title: "Get a Nexlify license",
    body: "Purchase a plan on the pricing page. After checkout you receive an XSTR-… key in your dashboard. You can pass it to the installer or activate it in the panel later.",
  },
  {
    title: "Order a Linux VPS",
    body: "Use Ubuntu 22.04+ or Debian 11+ with at least 2 GB RAM (4 GB recommended). You need root or sudo over SSH.",
  },
  {
    title: "Point DNS at the server",
    body: "Create an A record for your panel hostname (e.g. panel.example.com) to your VPS public IP. Wait for DNS to propagate before requesting SSL.",
  },
  {
    title: "Connect over SSH",
    body: "Log in as root (or a user with sudo).",
    code: "ssh root@YOUR_VPS_IP",
  },
  {
    title: "Run the one-line installer",
    body: "Paste the command below. Include --domain, --email, and --license when you have them. The script takes several minutes.",
    code: `curl -fsSL ${PANEL_INSTALL_SCRIPT_URL} | sudo bash -s -- --domain 'panel.example.com' --email 'you@example.com' --license 'XSTR-...'`,
  },
  {
    title: "Save the admin password",
    body: "When the script finishes, credentials are written on the server:",
    code: "cat /opt/nexlify-panel/.install-credentials",
  },
  {
    title: "Open the panel",
    body: "Visit https://your-domain/login (or http:// if you skipped SSL). Sign in as admin with the password from the credentials file.",
  },
  {
    title: "Activate your license",
    body: "If you did not pass --license during install, go to Admin → License in the panel, paste your XSTR-… key, and save.",
  },
];
