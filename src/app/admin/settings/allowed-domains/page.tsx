"use client";

import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function AllowedDomainsSettingsPage() {
  return (
    <SettingsPanelForm
      group="allowed-domains"
      title="Allowed Domains"
      description="Restrict which domains can embed or access the panel. Prevents unauthorized iframe embedding and hotlinking."
      sections={[
        {
          title: "Domain restrictions",
          info: "Checks Origin and Referer headers against the allowed list. Requests without a valid origin are blocked when enforcement is enabled.",
          fields: [
            { key: "enabled", label: "Enable domain restrictions", type: "yesno", hint: "Only allow requests from whitelisted domains." },
            { key: "domains", label: "Allowed domains (one per line)", type: "textarea", colSpan: 2, hint: "List of domains allowed to embed or access the panel. Include protocol (https://)." },
          ],
        },
        {
          title: "Enforcement",
          fields: [
            { key: "enforceOnEmbed", label: "Enforce on iframe embeds", type: "yesno", hint: "Check X-Frame-Options and CSP frame-ancestors." },
            { key: "blockUnknownOrigin", label: "Block unknown Origin", type: "yesno", hint: "Reject requests with no Origin or Referer header." },
            { key: "allowLocalhost", label: "Allow localhost", type: "yesno", hint: "Always allow requests from localhost (127.0.0.1, ::1)." },
          ],
        },
        {
          title: "Custom response headers",
          info: "Add custom headers to all responses. Useful for security headers or CORS.",
          fields: [
            { key: "customHeaders", label: "Custom headers (JSON array)", type: "textarea", colSpan: 2, hint: "Format: [{\"name\":\"X-Custom\",\"value\":\"foo\"}]. Added to all panel responses." },
          ],
        },
        { title: "Notes", fields: [{ key: "notes", label: "Notes", type: "textarea", colSpan: 2 }] },
      ]}
    />
  );
}
