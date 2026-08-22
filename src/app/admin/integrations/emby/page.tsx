"use client";

import { HostedMediaIntegrationPage } from "@/components/hosted-media-integration-page";

export default function EmbyIntegrationPage() {
  return (
    <HostedMediaIntegrationPage
      def={{
        type: "emby",
        title: "Emby",
        description:
          "Connect an Emby server (URL + API key). Sync imports movies and series as hosted streams routed through your LB.",
        urlLabel: "Emby server URL",
        urlPlaceholder: "http://emby.local:8096",
        tokenLabel: "API key",
        tokenPlaceholder: "Emby API key (Dashboard → Advanced → API key)",
      }}
    />
  );
}
