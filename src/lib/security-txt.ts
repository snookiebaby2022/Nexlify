import { site } from "@/lib/site";

/** RFC 9116 security.txt — refresh before Expires. */
export const SECURITY_TXT_EXPIRES = "2027-06-20T00:00:00.000Z";

export function buildSecurityTxt(): string {
  const canonical = `${site.url}/.well-known/security.txt`;

  return [
    `Contact: mailto:security@${site.domain}`,
    `Contact: mailto:${site.supportEmail}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    `Preferred-Languages: en`,
    `Canonical: ${canonical}`,
    `Policy: ${site.url}/terms`,
    `Policy: ${site.url}/privacy`,
    `Acknowledgments: ${site.url}/help`,
    "",
  ].join("\n");
}
