export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WEBSITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://nexlify.live"
  );
}

export function stripeWebhookUrl(): string {
  return `${getAppUrl()}/api/stripe/webhook`;
}

export function paypalWebhookUrl(): string {
  return `${getAppUrl()}/api/paypal/webhook`;
}
