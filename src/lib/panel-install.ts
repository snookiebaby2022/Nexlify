/** Shared copy for /install — keep installer docs in sync with scripts/install-linux.sh */

export const PANEL_INSTALL_DIR = "/opt/nexlify-panel";
export const CREDENTIALS_ROOT_DIR = "/root/nexlify";
export const CREDENTIALS_FILE = `${CREDENTIALS_ROOT_DIR}/install-credentials`;
export const INSTALLER_VERSION = "v168";

export const cleanReinstallCommand = `sudo rm -rf ${PANEL_INSTALL_DIR}`;

export const simpleInstallCommand = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --domain YOUR_IP_OR_DOMAIN`;

export function buildOneClickInstallCommand(opts: {
  domain?: string;
  email?: string;
}): string {
  const domain = opts.domain ?? "YOUR_IP_OR_DOMAIN";
  const email = opts.email?.trim();
  if (email) {
    return `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --domain ${domain} --email ${email}`;
  }
  return `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --domain ${domain}`;
}

export const oneClickInstallExample = buildOneClickInstallCommand({});

export const cleanReinstallWithFreshFlag = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --fresh --domain YOUR_IP_OR_DOMAIN`;

export const wgetInstallExample = `wget -qO- 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --domain YOUR_IP_OR_DOMAIN`;

export const credentialsHelp = {
  file: CREDENTIALS_FILE,
  rootDir: CREDENTIALS_ROOT_DIR,
  rootFile: CREDENTIALS_FILE,
  viewCommand: `cat ${CREDENTIALS_FILE}`,
  fields: [
    { key: "login_url", label: "Open in browser — no port number needed (http://YOUR_IP/login)" },
    { key: "admin_user / admin_password", label: "Sign in — then add license in the panel" },
    { key: "domain", label: "Your domain or server IP" },
    { key: "postgres_user / postgres_password", label: "PostgreSQL (database)" },
  ],
};
