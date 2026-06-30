import { SettingsPanelForm } from "@/components/settings-panel-form";

export default function BillingSettingsPage() {
  return (
    <SettingsPanelForm
      group="billing"
      title="Billing & checkout"
      description="Configure payment gateways for website billing and checkout."
      sections={[
        {
          title: "PayPal (website checkout)",
          info: "Configure PayPal REST credentials for nexlify.live or WHMCS custom modules.",
          fields: [
            { key: "paypalClientId", label: "PayPal client ID" },
            { key: "paypalClientSecret", label: "PayPal client secret", type: "password" },
            { key: "paypalSandbox", label: "Sandbox mode", type: "yesno" },
            { key: "paypalWebhookUrl", label: "Webhook URL (reference)", placeholder: "https://yoursite.com/api/billing/paypal" },
          ],
        },
        {
          title: "Stripe",
          info: "Accept credit card payments via Stripe. Create a Stripe account and get your API keys from the Stripe Dashboard.",
          fields: [
            { key: "stripePublishableKey", label: "Stripe Publishable Key", placeholder: "pk_live_... or pk_test_..." },
            { key: "stripeSecretKey", label: "Stripe Secret Key", type: "password", placeholder: "sk_live_... or sk_test_..." },
            { key: "stripeWebhookSecret", label: "Stripe Webhook Secret", type: "password", placeholder: "whsec_..." },
            { key: "stripeTestMode", label: "Test mode", type: "yesno", hint: "Use test keys for development. Toggle off for live payments." },
            { key: "stripeWebhookUrl", label: "Webhook URL (reference)", placeholder: "https://yoursite.com/api/billing/stripe" },
          ],
        },
        {
          title: "Coinbase Commerce",
          info: "Accept cryptocurrency payments via Coinbase Commerce.",
          fields: [
            { key: "coinbaseApiKey", label: "Coinbase API Key", type: "password", placeholder: "..." },
            { key: "coinbaseWebhookSecret", label: "Coinbase Webhook Secret", type: "password", placeholder: "..." },
            { key: "coinbaseTestMode", label: "Test mode", type: "yesno" },
            { key: "coinbaseWebhookUrl", label: "Webhook URL (reference)", placeholder: "https://yoursite.com/api/billing/coinbase" },
          ],
        },
        {
          title: "Cryptomus",
          info: "Accept cryptocurrency payments via Cryptomus.",
          fields: [
            { key: "cryptomusApiKey", label: "Cryptomus API Key", type: "password", placeholder: "..." },
            { key: "cryptomusMerchantId", label: "Cryptomus Merchant ID", placeholder: "..." },
            { key: "cryptomusWebhookSecret", label: "Cryptomus Webhook Secret", type: "password", placeholder: "..." },
            { key: "cryptomusTestMode", label: "Test mode", type: "yesno" },
          ],
        },
        {
          title: "Binance Pay",
          info: "Accept cryptocurrency payments via Binance Pay.",
          fields: [
            { key: "binanceApiKey", label: "Binance API Key", type: "password", placeholder: "..." },
            { key: "binanceSecretKey", label: "Binance Secret Key", type: "password", placeholder: "..." },
            { key: "binanceWebhookSecret", label: "Binance Webhook Secret", type: "password", placeholder: "..." },
            { key: "binanceTestMode", label: "Test mode", type: "yesno" },
          ],
        },
        {
          title: "Coupons",
          fields: [
            {
              key: "couponCheckoutEnabled",
              label: "Allow coupon validation API",
              type: "yesno",
              hint: "POST /api/billing/coupon with { code, days }",
            },
          ],
        },
      ]}
    />
  );
}
