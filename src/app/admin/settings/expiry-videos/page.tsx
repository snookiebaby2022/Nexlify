import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function ExpiryVideosSettingsPage() {
  return (
    <SettingsPanelForm
      group="expiry-videos"
      title="Custom Expiry Videos"
      description="Branded expiration message videos shown to customers when their subscription expires."
      sections={[
        {
          title: "General",
          fields: [
            { key: "expiryVideosEnabled", label: "Enable expiry videos", type: "yesno", hint: "Show custom videos when subscriptions expire." },
            { key: "expiryVideoAutoPlay", label: "Auto-play video", type: "yesno", hint: "Start playing the video automatically." },
            { key: "expiryVideoBranding", label: "Show branding", type: "yesno", hint: "Display your logo and brand colors on the video page." },
          ],
        },
        {
          title: "Video Content",
          fields: [
            { key: "expiryVideoUrl", label: "Video URL", type: "text", placeholder: "https://yourcdn.com/expiry-video.mp4", hint: "MP4 URL of the expiration video." },
            { key: "expiryVideoFallbackImage", label: "Fallback image URL", type: "text", placeholder: "https://yourcdn.com/expiry-image.jpg", hint: "Image shown if video fails to load." },
            { key: "expiryVideoMessage", label: "Message text", type: "textarea", placeholder: "Your subscription has expired. Please renew to continue watching.", hint: "Text displayed below the video." },
          ],
        },
        {
          title: "Redirect",
          fields: [
            { key: "expiryVideoRedirectUrl", label: "Redirect URL", type: "text", placeholder: "https://yourstore.com/renew", hint: "URL to redirect users after watching the video." },
          ],
        },
      ]}
    />
  );
}
