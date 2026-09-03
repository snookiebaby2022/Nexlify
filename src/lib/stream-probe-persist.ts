/** Decide whether a probe result should change lastProbeOk (avoid HEAD false fails). */

export type PersistableProbe = {
  status: string;
  message?: string | null;
};

export type ProbePersistDecision = {
  skipped: boolean;
  write: boolean;
  lastProbeOk?: boolean;
  lastProbeError?: string | null;
};

export function decideProbePersist(opts: {
  skipped?: boolean;
  fast?: boolean;
  probe: PersistableProbe;
}): ProbePersistDecision {
  if (opts.skipped) {
    return { skipped: true, write: false };
  }
  const status = String(opts.probe.status ?? "");
  const ok = status === "online" || status === "degraded";
  if (ok) {
    return {
      skipped: false,
      write: true,
      lastProbeOk: true,
      lastProbeError: status === "online" ? null : String(opts.probe.message ?? "Degraded").slice(0, 500),
    };
  }
  // Fast HEAD probes fail on many IPTV origins that still serve GET/TS. Do not persist fail.
  if (opts.fast) {
    return { skipped: false, write: false };
  }
  return {
    skipped: false,
    write: true,
    lastProbeOk: false,
    lastProbeError: String(opts.probe.message ?? "Probe failed").slice(0, 500),
  };
}
