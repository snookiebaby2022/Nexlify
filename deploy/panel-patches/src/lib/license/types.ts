export type LicensePayloadV1 = {
  v: 1;
  /** License id (invoice / order id) */
  lid: string;
  /** Customer email or name */
  sub: string;
  /** Unix expiry seconds */
  exp: number;
  /** Plan term: 1m | 3m | 6m | 1y */
  term?: string;
  /** Tier mirrors term for licensed keys */
  tier: string;
  /** Issued-at unix */
  iat: number;
  /** Bind to one panel instance id (empty = bind on first activate) */
  iid?: string;
  /** Allowed panel hostnames (empty = any) */
  dom?: string[];
  /** Max stream servers (0 = unlimited) */
  maxServers?: number;
};

export type LicenseStatus = {
  valid: boolean;
  reason?: string;
  tier?: string;
  term?: string;
  termLabel?: string;
  expiresAt?: string;
  licensee?: string;
  licenseId?: string;
  instanceBound?: boolean;
  trial?: boolean;
  licensed?: boolean;
  trialEndsAt?: string;
  onlineRequired?: boolean;
  lastVerifiedAt?: string;
};
