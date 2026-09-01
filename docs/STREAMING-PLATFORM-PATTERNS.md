# Streaming platform patterns (public sources)

This document summarizes **official/public** engineering patterns from IPTV middleware and media-server projects. Nexlify implements these as **clean-room patterns** — no proprietary, leaked, or AGPL code is copied into this repository.

## Provenance rules

- **Use:** official docs, canonical open-source repositories, vendor specification PDFs, and public API manuals.
- **Do not use:** community mirrors with uncertain provenance (legacy Xtream UI), leaked admin API dumps, or AGPL code copied verbatim.
- **Xtream Codes (legacy):** treat URL/API shapes as interoperability contracts only ([Eurojust operation context](https://www.eurojust.europa.eu/news/eurojust-helps-unravel-massive-trans-european-pay-tv-fraud)).
- **XUI.one / 1-Stream / Setplex / MwareTV:** marketing and high-level architecture only; detailed tuning is not publicly documented.

## Reusable patterns implemented in Nexlify

| Pattern | Source inspiration | Nexlify location |
|--------|-------------------|------------------|
| One upstream ingest per channel, fan-out locally | XC_VM `xc_fanout`, MistServer shared memory | `scripts/iptv-edge-proxy.mjs` |
| Bounded client lag / drop slow viewers | MistServer cursors, MediaMTX backpressure | `scripts/iptv-edge-proxy.mjs` |
| Logical channel vs physical source priority | Tvheadend service/channel model | `src/lib/resolve-stream-url.ts`, circuit breaker |
| Origin / edge separation | SRS, Wowza Live Stream Repeater | `docs/IPTV-SCALE.md`, multi-edge scripts |
| Circuit breaker + recovery probe | AWS MediaLive failover hysteresis | `src/lib/source-circuit-breaker.ts` |
| Host-level probe cooldown | Flussonic source grouping | `src/lib/source-host-circuit.ts` |
| Bounded probe pool + jitter | Nimble/WMSPanel operational guidance | `src/lib/source-probe-scheduler.ts` |
| Redis-backed auth/catalog cache | XC_VM + panel cluster pattern | `src/lib/cache.ts`, `src/lib/live-auth-cache.ts` |
| Batched session heartbeats | Red5 Pro capacity expressions | `src/app/api/internal/connection-pulse-batch/` |
| 30% admission headroom | Flussonic N+1, AWS capacity planning | `src/lib/server-load-metrics.ts` |
| GPU session admission | OvenMediaEngine, Nimble NVENC sharing | `src/lib/gpu-admission.ts` |
| Popular-channel prewarm | Wowza origin shielding | `src/lib/edge-prewarm.ts` |
| Six-edge N+1 fleet | Flussonic Catena clustering | `scripts/deploy-edge-fleet-6.sh` |

## Open-source engines (verified public docs)

- **MediaMTX** — demand pull, bounded HLS segments, Prometheus metrics ([mediamtx.org](https://mediamtx.org/docs/references/configuration-file))
- **MistServer** — one writer / many readers, monitoring API ([docs.mistserver.org](https://docs.mistserver.org/mistserver/introduction/architecture/))
- **SRS** — origin/edge, one pull per stream per edge ([ossrs.io](https://ossrs.io/lts/en-us/docs/v6/doc/edge))
- **OvenMediaEngine** — GPU worker pools, origin-edge clustering ([docs.ovenmediaengine.com](https://docs.ovenmediaengine.com/origin-edge-clustering.md))
- **Tvheadend** — channel/service priority model ([docs.tvheadend.org](https://docs.tvheadend.org/documentation/setup/concepts))
- **XC_VM** — fan-out daemon pattern ([github.com/Vateron-Media/XC_VM](https://github.com/Vateron-Media/XC_VM))

## Commercial platforms (public detail only)

- **Flussonic Catena / Media Server** — cluster placement, source failover, NVENC ([flussonic.com/doc](https://flussonic.com/doc/protocols/sources/))
- **Wowza** — origin/edge repeaters, ABR keyframe alignment ([wowza.com/docs](https://www.wowza.com/docs/How-to-configure-a-live-stream-repeater))
- **Nimble / WMSPanel** — multi-tier origin shield, cache sizing ([softvelum.com](https://softvelum.com/2025/08/multi-tier-streaming-architecture/))
- **Ant Media / Red5 Pro** — role-separated origin/transcoder/edge ([docs.antmedia.io](https://docs.antmedia.io/guides/clustering-and-scaling/manual-configuration/cluster-installation/))
- **AWS Elemental** — dual-pipeline redundancy, input failover ([AWS MediaLive docs](https://docs.aws.amazon.com/medialive/latest/ug/automatic-input-failover.html))

## Capacity target (this deployment)

- **Design load:** 5,000 sustained viewers + 30% headroom = 6,500 sessions.
- **Observed bitrate:** ~5 Mbps/viewer → ~32 Gbps engineered egress.
- **Minimum topology:** five active 10 Gbps edges + one spare; streaming DNS must bypass panel byte hairpin for production scale.

See also: [docs/IPTV-SCALE.md](./IPTV-SCALE.md), [scripts/verify-load-test-slo.cjs](../scripts/verify-load-test-slo.cjs).
