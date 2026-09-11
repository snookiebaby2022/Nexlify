-- Outbound egress: PROXY vs VPN tunnel (local HTTP gateway on LB) + SOCKS-ready proxies.

CREATE TYPE "ServerOutboundMode" AS ENUM ('NONE', 'PROXY', 'VPN');
CREATE TYPE "VpnTunnelKind" AS ENUM ('WIREGUARD', 'OPENVPN');

CREATE TABLE "VpnProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "VpnTunnelKind" NOT NULL DEFAULT 'WIREGUARD',
    "configText" TEXT NOT NULL,
    "localHttpPort" INTEGER NOT NULL DEFAULT 18080,
    "interfaceName" TEXT NOT NULL DEFAULT 'wg-nexlify0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpnProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StreamServer" ADD COLUMN "outboundMode" "ServerOutboundMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "StreamServer" ADD COLUMN "vpnProfileId" TEXT;

-- Existing servers with a proxy assigned behave as PROXY mode.
UPDATE "StreamServer" SET "outboundMode" = 'PROXY' WHERE "proxyId" IS NOT NULL;

ALTER TABLE "StreamServer"
  ADD CONSTRAINT "StreamServer_vpnProfileId_fkey"
  FOREIGN KEY ("vpnProfileId") REFERENCES "VpnProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
