-- AlterTable
ALTER TABLE "StreamProvider" ADD COLUMN "remoteExpiresAt" TIMESTAMP(3);
ALTER TABLE "StreamProvider" ADD COLUMN "remoteMaxConnections" INTEGER;
ALTER TABLE "StreamProvider" ADD COLUMN "remoteUpstreamConnections" INTEGER;
