"use client";

import { HostedMediaIntegrationPage } from "@/components/hosted-media-integration-page";

export default function YoutubeIntegrationPage() {
  return (
    <HostedMediaIntegrationPage
      def={{
        type: "youtube",
        title: "YouTube channels",
        description:
          "Registers a YouTube channel as live stream entries. Playback resolves via Invidious/relay on your LB stream server.",
        urlLabel: "Channel URL",
        urlPlaceholder: "https://www.youtube.com/@channel",
        channelMode: true,
      }}
    />
  );
}
