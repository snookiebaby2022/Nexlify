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
            {
              key: "whiteLabelHeaderColor",
              label: "Header colour",
              type: "color",
              placeholder: "#0f172a",
              hint: "Top bar colour for admin and reseller panels. Leave empty for the default navy gradient. Operators can also pick a colour from the header itself.",
            },
          ],
        },
        {
          title: "Sidebar",
          fields: [
            {
              key: "whiteLabelSidebarNavAccent",
              label: "Category highlight colour",
              type: "color",
              placeholder: "#22d3ee",
              hint: "Colour for the active sidebar category label and sub-link highlight. Leave empty to use the accent colour.",
            },
            {
              key: "whiteLabelSidebarHiddenHrefs",
              label: "Hidden sidebar links",
              type: "textarea",
              placeholder: "/admin/stream_errors\n/admin/management/logs",
              hint: "One path per line (e.g. /admin/logs). Matching top-level and submenu links are hidden for all admins.",
            },
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
