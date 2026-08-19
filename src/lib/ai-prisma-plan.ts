const SECRET_FIELDS = new Set([
  "password",
  "passwordhash",
  "passwordplain",
  "totpsecret",
  "apikey",
  "accesscode",
  "smtppassword",
  "secret",
]);

const WHERE_OPS = new Set([
  "equals",
  "contains",
  "startsWith",
  "endsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "not",
  "mode",
  "AND",
  "OR",
  "NOT",
  "is",
  "isNot",
  "some",
  "every",
  "none",
]);

export const AI_PRISMA_MODELS = [
  "stream",
  "line",
  "category",
  "bouquet",
  "liveConnection",
  "epgSource",
  "epgProgram",
  "connectionGeography",
  "panelUser",
  "streamServer",
  "streamHealthCheck",
  "package",
  "creditTransaction",
] as const;

export type AiPrismaModel = (typeof AI_PRISMA_MODELS)[number];

const PASCAL_TO_CAMEL: Record<string, AiPrismaModel> = {
  Stream: "stream",
  Line: "line",
  Category: "category",
  Bouquet: "bouquet",
  LiveConnection: "liveConnection",
  EpgSource: "epgSource",
  EpgProgram: "epgProgram",
  ConnectionGeography: "connectionGeography",
  PanelUser: "panelUser",
  StreamServer: "streamServer",
  StreamHealthCheck: "streamHealthCheck",
  Package: "package",
  CreditTransaction: "creditTransaction",
};

export function resolveAiPrismaModel(raw: string | undefined | null): AiPrismaModel | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if ((AI_PRISMA_MODELS as readonly string[]).includes(trimmed)) {
    return trimmed as AiPrismaModel;
  }
  return PASCAL_TO_CAMEL[trimmed] ?? null;
}

function isSecretField(name: string): boolean {
  return SECRET_FIELDS.has(name.toLowerCase());
}

export function sanitizeAiSelect(
  select: Record<string, unknown> | undefined,
  model: AiPrismaModel
): Record<string, boolean> | undefined {
  const out: Record<string, boolean> = {};
  if (select && typeof select === "object") {
    for (const [key, value] of Object.entries(select)) {
      if (isSecretField(key)) continue;
      if (value === true) out[key] = true;
    }
  }
  if (model === "panelUser") {
    out.passwordHash = false;
    out.passwordPlain = false;
    out.totpSecret = false;
    out.apiKey = false;
    out.accessCode = false;
  }
  if (model === "line") {
    out.password = false;
  }
  const positives = Object.entries(out).filter(([, v]) => v);
  if (!positives.length) return undefined;
  return Object.fromEntries(positives);
}

export function sanitizeAiWhere(where: unknown, depth = 0): Record<string, unknown> {
  if (!where || typeof where !== "object" || Array.isArray(where) || depth > 6) return {};
  const src = where as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (isSecretField(key)) continue;
    if (key === "AND" || key === "OR" || key === "NOT") {
      if (Array.isArray(value)) {
        out[key] = value.map((item) => sanitizeAiWhere(item, depth + 1));
      } else if (value && typeof value === "object") {
        out[key] = sanitizeAiWhere(value, depth + 1);
      }
      continue;
    }
    if (WHERE_OPS.has(key)) {
      out[key] = value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeAiWhere(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function forcedAiTake(take: unknown, max = 50): number {
  const n = typeof take === "number" ? take : Number(take);
  if (!Number.isFinite(n) || n <= 0) return max;
  return Math.min(Math.floor(n), max);
}

export function redactAiRow(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAiRow);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretField(key)) continue;
    out[key] = redactAiRow(v);
  }
  return out;
}
