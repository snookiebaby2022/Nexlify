import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function LbRedirectSettingsPage() {
  return (
    <SettingsPanelForm
      group="lb-redirect"
      title="Secure LB Redirection"
      description="Encrypted get.php and Stalker Portal links for load balancer redirection."
      sections={[
        {
          title: "General",
          fields: [
            { key: "lbRedirectEnabled", label: "Enable secure redirection", type: "yesno", hint: "Encrypt load balancer redirect URLs." },
            { key: "lbForceHttps", label: "Force HTTPS", type: "yesno", hint: "Always use HTTPS for redirect URLs." },
            { key: "lbTokenExpirySeconds", label: "Token expiry (seconds)", type: "number", placeholder: "300", hint: "How long redirect tokens remain valid." },
          ],
        },
        {
          title: "Encryption",
          fields: [
            { key: "lbEncryptGetPhp", label: "Encrypt get.php links", type: "yesno", hint: "Sign and encrypt get.php URLs with tokens." },
            { key: "lbEncryptStalker", label: "Encrypt Stalker links", type: "yesno", hint: "Sign and encrypt Stalker Portal URLs." },
            { key: "lbSignatureAlgorithm", label: "Signature algorithm", type: "select", options: [{ value: "sha256", label: "SHA-256" }, { value: "sha512", label: "SHA-512" }], hint: "Hash algorithm for URL signatures." },
          ],
        },
      ]}
    />
  );
}
