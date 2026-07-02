import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function WhiteLabelSettingsPage() {
  return (
    <SettingsPanelForm
      group="white-label"
      title="White-label Portal"
      description="Customize the appearance of your panel and client-facing portals."
      sections={[
        {
          title: "Branding",
          fields: [
            { key: "whiteLabelAppName", label: "App name", placeholder: "My IPTV", hint: "Displayed in the browser title and app header." },
            { key: "whiteLabelLogoUrl", label: "Logo URL", placeholder: "https://yoursite.com/logo.png", hint: "Recommended: 200x60px transparent PNG." },
            { key: "whiteLabelFaviconUrl", label: "Favicon URL", placeholder: "https://yoursite.com/favicon.ico", hint: "Browser tab icon." },
            { key: "whiteLabelPrimaryColor", label: "Primary color", placeholder: "#00c0ef", hint: "Hex color for buttons, links, and accents." },
            { key: "whiteLabelAccentColor", label: "Accent color", placeholder: "#5eb8e8", hint: "Secondary color for highlights and gradients." },
          ],
        },
        {
          title: "Custom CSS",
          fields: [
            { key: "whiteLabelCustomCss", label: "Custom CSS", type: "textarea", placeholder: "/* Add your custom styles here */\n.panel-sidebar { background: #1a1a2e; }", hint: "Injected into the panel head. Use with caution." },
          ],
        },
        {
          title: "Domain",
          fields: [
            { key: "whiteLabelDomain", label: "Custom domain", placeholder: "panel.yourbrand.com", hint: "CNAME your domain to this panel." },
          ],
        },
      ]}
    />
  );
}
