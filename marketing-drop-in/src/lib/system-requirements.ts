export const HARDWARE_ROLES = [
  {
    role: "Panel VPS",
    recommended: { ram: "64–256 GB", cpu: "2 cores", disk: "40GB SSD" },
    minimum: { ram: "32 GB", cpu: "1 core", disk: "20GB SSD" },
  },
  {
    role: "Stream edge",
    recommended: { ram: "32 GB+", cpu: "4 cores", disk: "100GB SSD" },
    minimum: { ram: "32 GB", cpu: "2 cores", disk: "50GB SSD" },
  },
] as const;

export const OS_REQUIREMENTS = [
  { os: "Ubuntu 24.04 LTS", status: "Fully supported — recommended" },
  { os: "Ubuntu 22.04 LTS", status: "Fully supported" },
  { os: "Ubuntu 20.04 LTS", status: "Supported" },
  { os: "Debian 12", status: "Fully supported" },
  { os: "Debian 11", status: "Supported" },
  { os: "CentOS 9 Stream", status: "Supported with caveats" },
] as const;

export const REQUIREMENTS_SUMMARY =
  "Nexlify runs on Ubuntu 20.04, 22.04, or 24.04 LTS (and Debian 11/12). Panel hosts need at least 32 GB RAM (64–256 GB recommended). Stream servers need 32 GB RAM or more. For production with 1,000+ concurrent viewers, use a dedicated stream edge alongside the panel.";

export const SYSTEM_REQUIREMENTS = {
  os: ["Ubuntu 24.04 LTS", "Ubuntu 22.04 LTS", "Ubuntu 20.04 LTS", "Debian 12", "CentOS 9 Stream"],
  ram: "32 GB minimum (64–256 GB recommended)",
  cpu: "2 cores minimum (4 cores recommended)",
  disk: "20GB SSD minimum",
  network: "1Gbps unmetered recommended",
  ports: [80, 443, 8080, 1935, 554],
};

export function getSystemRequirements() {
  return SYSTEM_REQUIREMENTS;
}
