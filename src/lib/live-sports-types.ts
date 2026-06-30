export type LiveSportsProvider = {
  id: string;
  label: string;
  enabled: boolean;
  fixturesUrl: string;
  apiKey: string;
  authHeader: string;
  authScheme: "" | "Bearer" | "ApiKey";
};

export type LiveSportsSettings = {
  enabled: boolean;
  cacheTtlSec: number;
  providers: LiveSportsProvider[];
};

export const SPORTS_API_PRESETS: {
  label: string;
  fixturesUrl: string;
  authHeader: string;
  authScheme: LiveSportsProvider["authScheme"];
}[] = [
  {
    label: "API-Sports — Football (Premier League, etc.)",
    fixturesUrl: "https://v3.football.api-sports.io/fixtures?next=10",
    authHeader: "x-apisports-key",
    authScheme: "",
  },
  {
    label: "API-Sports — Basketball (NBA, etc.)",
    fixturesUrl: "https://v3.basketball.api-sports.io/games?next=10",
    authHeader: "x-apisports-key",
    authScheme: "",
  },
  {
    label: "API-Sports — MMA / UFC",
    fixturesUrl: "https://v3.mma.api-sports.io/fights?next=10",
    authHeader: "x-apisports-key",
    authScheme: "",
  },
  {
    label: "API-Sports — Hockey (NHL, etc.)",
    fixturesUrl: "https://v3.hockey.api-sports.io/games?next=10",
    authHeader: "x-apisports-key",
    authScheme: "",
  },
  {
    label: "API-Sports — American Football (NFL)",
    fixturesUrl: "https://v3.american-football.api-sports.io/games?next=10",
    authHeader: "x-apisports-key",
    authScheme: "",
  },
  {
    label: "Custom endpoint",
    fixturesUrl: "",
    authHeader: "x-apisports-key",
    authScheme: "",
  },
];

export function newProviderId(): string {
  return `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyProvider(partial?: Partial<LiveSportsProvider>): LiveSportsProvider {
  return {
    id: newProviderId(),
    label: "Sports feed",
    enabled: true,
    fixturesUrl: "",
    apiKey: "",
    authHeader: "x-apisports-key",
    authScheme: "",
    ...partial,
  };
}

export function providerFromPreset(presetIndex: number, apiKey = ""): LiveSportsProvider {
  const preset = SPORTS_API_PRESETS[presetIndex] ?? SPORTS_API_PRESETS[SPORTS_API_PRESETS.length - 1];
  return emptyProvider({
    label: preset.label.replace(/^API-Sports — /, ""),
    fixturesUrl: preset.fixturesUrl,
    apiKey,
    authHeader: preset.authHeader,
    authScheme: preset.authScheme,
  });
}

export function parseLiveSportsSettings(raw: Record<string, unknown>): LiveSportsSettings {
  const providers = Array.isArray(raw.providers)
    ? (raw.providers as LiveSportsProvider[]).map((p) => ({
        id: String(p.id ?? newProviderId()),
        label: String(p.label ?? "Sports feed"),
        enabled: p.enabled !== false,
        fixturesUrl: String(p.fixturesUrl ?? "").trim(),
        apiKey: String(p.apiKey ?? "").trim(),
        authHeader: String(p.authHeader ?? "x-apisports-key").trim() || "x-apisports-key",
        authScheme: (p.authScheme === "Bearer" || p.authScheme === "ApiKey" ? p.authScheme : "") as LiveSportsProvider["authScheme"],
      }))
    : [];

  return {
    enabled: raw.enabled !== false,
    cacheTtlSec: Math.max(60, Number(raw.cacheTtlSec ?? 900) || 900),
    providers,
  };
}

export function buildAuthHeaders(provider: LiveSportsProvider): Record<string, string> {
  const key = provider.apiKey.trim();
  if (!key) return {};
  if (provider.authHeader.toLowerCase() === "authorization") {
    const scheme = provider.authScheme === "Bearer" ? "Bearer" : provider.authScheme === "ApiKey" ? "ApiKey" : "";
    return { Authorization: scheme ? `${scheme} ${key}` : key };
  }
  return { [provider.authHeader]: key };
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export type SportsMatchRow = {
  id: number;
  league: string;
  home: string;
  away: string;
  status: string;
  time: string;
  source?: string;
  sortAt: number;
};

/** Normalize API-Sports football / basketball / hockey / MMA rows into dashboard matches. */
export function normalizeApiRowFromResponse(row: Record<string, unknown>, providerLabel: string): SportsMatchRow | null {
  const fixture = (row.fixture ?? row.game ?? row.fight) as Record<string, unknown> | undefined;
  if (!fixture) return null;

  const leagueObj = row.league as Record<string, unknown> | undefined;
  const league = pickString(leagueObj?.name, providerLabel) || providerLabel;

  const teams = row.teams as { home?: { name?: string }; away?: { name?: string } } | undefined;
  const fighters = row.fighters as { first?: { name?: string }; second?: { name?: string } } | undefined;

  const home = pickString(teams?.home?.name, fighters?.first?.name, "TBD");
  const away = pickString(teams?.away?.name, fighters?.second?.name, "TBD");

  const statusObj = fixture.status as { short?: string; long?: string } | string | undefined;
  const status =
    typeof statusObj === "string"
      ? statusObj
      : pickString(statusObj?.short, statusObj?.long, "NS");

  const dateRaw = pickString(fixture.date, fixture.timestamp ? new Date(Number(fixture.timestamp) * 1000).toISOString() : "");
  const sortAt = dateRaw ? new Date(dateRaw).getTime() : Date.now();
  const time = dateRaw
    ? new Date(dateRaw).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const id = Number(fixture.id ?? 0);
  if (!id) return null;

  return {
    id,
    league,
    home,
    away,
    status,
    time,
    source: providerLabel,
    sortAt,
  };
}
