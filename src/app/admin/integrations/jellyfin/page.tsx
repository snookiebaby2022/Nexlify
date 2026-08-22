"use client";

import { HostedMediaIntegrationPage } from "@/components/hosted-media-integration-page";

export default function JellyfinIntegrationPage() {
  return (
    <HostedMediaIntegrationPage
      def={{
        type: "jellyfin",
        title: "Jellyfin",
        description:
          "Connect a Jellyfin server (URL + API key). Sync imports movies and series as hosted streams routed through your LB.",
        urlLabel: "Jellyfin server URL",
        urlPlaceholder: "http://jellyfin.local:8096",
        tokenLabel: "API key",
        tokenPlaceholder: "Jellyfin API key (Dashboard → Advanced → API key)",
      }}
    />
  );
}
