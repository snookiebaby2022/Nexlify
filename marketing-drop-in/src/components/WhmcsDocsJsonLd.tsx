import { DocsArticleJsonLd } from "@/components/DocsArticleJsonLd";

const DOCS_PATH = "/docs/whmcs";

const ARTICLE_BODY =
  "Install WHMCS module. Connect your WHMCS store to https://nexlify.live so paid orders automatically create, renew, and revoke IPTV panel license keys. Follow steps: copy module files from the site repo to your WHMCS installation, configure environment variables, map WHMCS products to Nexlify plans, and manage addon licenses and music relays as part of the integration.";

export function WhmcsDocsJsonLd() {
  return (
    <DocsArticleJsonLd
      path={DOCS_PATH}
      headline="Install WHMCS module"
      description="Nexlify's IPTV panel documentation: Learn how to install and connect the WHMCS module to Nexlify to auto-create, renew, and revoke IPTV panel licenses."
      articleBody={ARTICLE_BODY}
      keywords="WHMCS, Nexlify, IPTV panel, module, integration, license management, streaming"
      about="WHMCS module integration"
    />
  );
}
