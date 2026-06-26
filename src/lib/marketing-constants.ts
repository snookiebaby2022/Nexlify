/** Public announcements channel */
export const TELEGRAM_CHANNEL_URL = "https://t.me/nexlifychannel";

/** Community group chat */
export const TELEGRAM_URL = "https://t.me/+ybW8lT1hgkRiYTFk";

export const FACEBOOK_URL =
  "https://www.facebook.com/profile.php?id=61590505869735";

export const STATUS_PAGE_URL = "https://nexlify.live/status";

/** Default OG image — dynamic 1200×630 PNG at /opengraph-image */
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image";

/** GBP → USD conversion for pricing display (approximate retail rate). */
export const GBP_TO_USD_RATE = 1.27;

/** Optional public trust metrics — set via env; omit to use generic copy. */
export const TRUST_OPERATORS = process.env.NEXT_PUBLIC_TRUST_OPERATORS?.trim() || null;
export const TRUST_ACTIVE_LINES = process.env.NEXT_PUBLIC_TRUST_LINES?.trim() || null;
export const TRUST_COUNTRIES = process.env.NEXT_PUBLIC_TRUST_COUNTRIES?.trim() || null;

export const SOFTWARE_POSITIONING =
  "IPTV reseller and management software only";

export const CONTENT_DISCLAIMER =
  "Nexlify does not host, stream, or distribute any copyrighted content, sports feeds, or channels.";
