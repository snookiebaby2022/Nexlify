import { prisma } from "@/lib/prisma";

export type PanelTransferSection =
  | "bouquets"
  | "streams"
  | "lines"
  | "resellers"
  | "providers";

export const PANEL_TRANSFER_SECTIONS: PanelTransferSection[] = [
  "bouquets",
  "streams",
  "lines",
  "resellers",
  "providers",
];

export type PanelTransferBundle = {
  version: 1;
  source: "nexlify_json";
  exportedAt: string;
  bouquets: {
    legacyId: string;
    name: string;
    streamLegacyIds: string[];
    sortOrder: number;
    isActive: boolean;
  }[];
  streams: {
    legacyId: string;
    name: string;
    streamUrl: string;
    type: string;
    streamIcon?: string;
    categoryName?: string;
    providerName?: string;
    providerPath?: string;
    hostedExternally?: boolean;
    isActive: boolean;
    epgChannelId?: string;
    channelId?: string;
  }[];
  lines: {
    legacyId?: string;
    username: string;
    password: string;
    expiresAt: string;
    maxConnections: number;
    status: string;
    bouquetLegacyIds: string[];
    notes?: string;
    allowedIps?: string;
    lockToIp?: boolean;
    authMode?: string;
    activeCode?: string;
    ownerUsername?: string;
  }[];
  resellers: {
    legacyId?: string;
    username: string;
    password?: string;
    role: string;
    parentUsername?: string;
    credits: number;
    maxLines: number;
    resellerDns?: string;
    bouquetNames: string[];
    isActive: boolean;
  }[];
  providers: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    providerType?: string;
    description?: string;
    region?: string;
    isActive: boolean;
  }[];
};

function parseSections(raw: string | null): Set<PanelTransferSection> {
  if (!raw || raw === "all") return new Set(PANEL_TRANSFER_SECTIONS);
  const parts = raw.split(",").map((s) => s.trim()) as PanelTransferSection[];
  const valid = parts.filter((p) => PANEL_TRANSFER_SECTIONS.includes(p));
  return valid.length ? new Set(valid) : new Set(PANEL_TRANSFER_SECTIONS);
}

export async function buildPanelTransferExport(
  sectionsParam: string | null
): Promise<PanelTransferBundle> {
  const sections = parseSections(sectionsParam);
  const bundle: PanelTransferBundle = {
    version: 1,
    source: "nexlify_json",
    exportedAt: new Date().toISOString(),
    bouquets: [],
    streams: [],
    lines: [],
    resellers: [],
    providers: [],
  };

  if (sections.has("bouquets")) {
    const bouquets = await prisma.bouquet.findMany({
      include: { streams: { include: { stream: { select: { name: true } } } } },
      orderBy: { sortOrder: "asc" },
    });
    bundle.bouquets = bouquets.map((b) => ({
      legacyId: b.name,
      name: b.name,
      streamLegacyIds: b.streams.map((bs) => bs.stream.name),
      sortOrder: b.sortOrder,
      isActive: b.isActive,
    }));
  }

  if (sections.has("providers")) {
    const providers = await prisma.streamProvider.findMany({ orderBy: { name: "asc" } });
    bundle.providers = providers.map((p) => ({
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey ?? undefined,
      providerType: p.providerType ?? undefined,
      description: p.description ?? undefined,
      region: p.region ?? undefined,
      isActive: p.isActive,
    }));
  }

  if (sections.has("streams")) {
    const streams = await prisma.stream.findMany({
      include: {
        category: { select: { name: true } },
        provider: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
    bundle.streams = streams.map((s) => ({
      legacyId: s.name,
      name: s.name,
      streamUrl: s.streamUrl,
      type: s.type,
      streamIcon: s.streamIcon ?? undefined,
      categoryName: s.category?.name,
      providerName: s.provider?.name,
      providerPath: s.providerPath ?? undefined,
      hostedExternally: s.hostedExternally,
      isActive: s.isActive,
      epgChannelId: s.epgChannelId ?? undefined,
      channelId: s.channelId ?? undefined,
    }));
  }

  if (sections.has("lines")) {
    const lines = await prisma.line.findMany({
      include: {
        bouquets: { include: { bouquet: { select: { name: true } } } },
        owner: { select: { username: true } },
      },
      orderBy: { username: "asc" },
    });
    bundle.lines = lines.map((l) => ({
      legacyId: l.externalId ?? l.id,
      username: l.username,
      password: l.password,
      expiresAt: l.expiresAt.toISOString(),
      maxConnections: l.maxConnections,
      status: l.status,
      bouquetLegacyIds: l.bouquets.map((lb) => lb.bouquet.name),
      notes: l.notes ?? undefined,
      allowedIps: l.allowedIps ?? undefined,
      lockToIp: l.lockToIp,
      authMode: l.authMode,
      activeCode: l.activeCode ?? undefined,
      ownerUsername: l.owner?.username,
    }));
  }

  if (sections.has("resellers")) {
    const resellers = await prisma.panelUser.findMany({
      where: { role: { in: ["RESELLER", "SUB_RESELLER"] } },
      include: {
        parent: { select: { username: true } },
        resellerBouquets: { include: { bouquet: { select: { name: true } } } },
      },
      orderBy: { username: "asc" },
    });
    bundle.resellers = resellers.map((r) => ({
      legacyId: r.id,
      username: r.username,
      role: r.role,
      parentUsername: r.parent?.username,
      credits: r.credits,
      maxLines: r.maxLines,
      resellerDns: r.resellerDns ?? undefined,
      bouquetNames: r.resellerBouquets.map((rb) => rb.bouquet.name),
      isActive: r.isActive,
    }));
  }

  return bundle;
}
