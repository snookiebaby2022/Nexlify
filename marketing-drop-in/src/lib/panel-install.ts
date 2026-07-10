/** Shared copy for /install — keep installer docs in sync with scripts/install-linux.sh */

export const PANEL_INSTALL_DIR = "/opt/nexlify-panel";
export const CREDENTIALS_ROOT_DIR = "/root/nexlify";
export const CREDENTIALS_FILE = `${CREDENTIALS_ROOT_DIR}/install-credentials`;
export const INSTALLER_VERSION = "v193";

export const cleanReinstallCommand = `sudo rm -rf ${PANEL_INSTALL_DIR}`;

export const simpleInstallCommand = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --ip YOUR_SERVER_IP`;

export function buildOneClickInstallCommand(opts: {
  ip?: string;
  license?: string;
}): string {
  const ip = opts.ip ?? "YOUR_SERVER_IP";
  const license = opts.license?.trim();
  if (license) {
    return `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --ip ${ip} --license ${license}`;
  }
  return `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --ip ${ip}`;
}

export const oneClickInstallExample = buildOneClickInstallCommand({});

export const cleanReinstallWithFreshFlag = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --fresh --ip YOUR_SERVER_IP`;

export const wgetInstallExample = `wget -qO- 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --ip YOUR_SERVER_IP`;

export const credentialsHelp = {
  file: CREDENTIALS_FILE,
  rootDir: CREDENTIALS_ROOT_DIR,
  rootFile: CREDENTIALS_FILE,
  viewCommand: `cat ${CREDENTIALS_FILE}`,
  fields: [
    { key: "login_url", label: "Open in browser — http://YOUR_SERVER_IP/login" },
    { key: "iptv_url", label: "IPTV / Smarters HTTP edge (line username + password)" },
    { key: "stream_http_port", label: "Stream edge port (80 for IP install)" },
    { key: "admin_user / admin_password", label: "Sign in — then add license in the panel" },
    { key: "domain", label: "Your server IP" },
    { key: "postgres_user / postgres_password", label: "PostgreSQL (database)" },
  ],
};
