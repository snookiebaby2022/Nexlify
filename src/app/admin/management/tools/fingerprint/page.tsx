import { SettingsForm } from "@/components/settings-form";

export default function FingerprintPage() {
  return (
    <SettingsForm
      group="fingerprint"
      title="Fingerprint"
      description="Stream access fingerprinting for anti-restream and client binding."
      backHref="/admin/management/tools"
      fields={[
        { key: "enabled", label: "Enable fingerprinting", type: "checkbox" },
        { key: "algorithm", label: "Algorithm", type: "select", options: [
          { value: "sha256", label: "SHA-256" },
          { value: "md5", label: "MD5" },
        ]},
        { key: "includeUserAgent", label: "Include user agent", type: "checkbox" },
        { key: "includeClientIp", label: "Include client IP", type: "checkbox" },
        { key: "secret", label: "Signing secret", type: "password" },
      ]}
    />
  );
}
