/** Shared copy for /install — keep installer docs in sync with scripts/install-linux.sh */

import panelReleases from "./panel-releases.json";

export const PANEL_INSTALL_DIR = "/opt/nexlify-panel";
export const CREDENTIALS_ROOT_DIR = "/root/nexlify";
export const CREDENTIALS_FILE = `${CREDENTIALS_ROOT_DIR}/install-credentials`;

/** Panel semver from synced release feed (matches package.json in panel repo). */
export const PANEL_VERSION = panelReleases.latestVersion;

/** Installer + tarball cache-bust — v1.9.7 matches panel Admin → Updates version. */
export const INSTALLER_VERSION = `v${PANEL_VERSION}`;

export const cleanReinstallCommand = `sudo rm -rf ${PANEL_INSTALL_DIR}`;

export const simpleInstallCommand = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash`;

export function buildOneClickInstallCommand(opts?: {
  ip?: string;
  license?: string;
}): string {
  const base = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash`;
  const flags: string[] = [];
  if (opts?.ip?.trim()) flags.push(`--ip ${opts.ip.trim()}`);
  if (opts?.license?.trim()) flags.push(`--license ${opts.license.trim()}`);
  if (flags.length === 0) return base;
  return `${base} -s -- ${flags.join(" ")}`;
}

export const oneClickInstallExample = buildOneClickInstallCommand();

export const cleanReinstallWithFreshFlag = `curl -fsSL 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash -s -- --fresh`;

export const wgetInstallExample = `wget -qO- 'https://nexlify.live/install/panel.sh?${INSTALLER_VERSION}' | sudo bash`;

export const credentialsHelp = {
  file: CREDENTIALS_FILE,
  rootDir: CREDENTIALS_ROOT_DIR,
  rootFile: CREDENTIALS_FILE,
  viewCommand: `cat ${CREDENTIALS_FILE}`,
  fields: [
    { key: "login_url", label: "Open in browser — printed at end of install (port 80)" },
    { key: "iptv_url", label: "IPTV / Smarters HTTP edge (line username + password)" },
    { key: "stream_http_port", label: "Stream edge port (80 for IP install)" },
    { key: "admin_user / admin_password", label: "Sign in — then add license in the panel" },
    { key: "domain", label: "Auto-detected server IP or hostname" },
    { key: "postgres_user / postgres_password", label: "PostgreSQL (database)" },
  ],
};
