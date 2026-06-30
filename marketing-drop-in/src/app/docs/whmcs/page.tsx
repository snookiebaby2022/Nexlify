import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { WhmcsDocsJsonLd } from "@/components/WhmcsDocsJsonLd";
import { pageSeo } from "@/lib/seo-pages";

export const metadata = pageSeo("/docs/whmcs");



export default function WhmcsDocsPage() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  const whmcsUrl = process.env.NEXT_PUBLIC_WHMCS_URL ?? "https://billing.yourdomain.com/cart.php";

  return (
    <div className="mesh-bg min-h-screen">
      <BreadcrumbJsonLd
        items={[
          { name: "Home", path: "/" },
          { name: "WHMCS module", path: "/docs/whmcs" },
        ]}
      />
      <WhmcsDocsJsonLd />
      <div className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">Integration</p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white">Install WHMCS module</h1>
        <p className="mt-4 text-[var(--muted)]">
          Connect your WHMCS store to {base} so paid orders automatically create, renew, and revoke
          IPTV panel license keys.
        </p>

        <div className="mt-10 space-y-8">
          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">1. Copy the module files</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              From this website repo, copy the server module folder into your WHMCS installation:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-slate-300">
{`# On your PC (project root)
whmcs/modules/servers/streambilling/

# On the WHMCS server
/path/to/whmcs/modules/servers/streambilling/
  streambilling.php
  README.md`}
            </pre>
            <p className="mt-3 text-sm text-[var(--muted)]">
              You only copy files — WHMCS does not run inside the Nexlify website app. The website
              exposes an API that WHMCS calls when orders change.
            </p>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">2. Configure the website (.env)</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              On the VPS at <code className="text-violet-300">/var/www/nexlify/.env</code> (or local{" "}
              <code className="text-violet-300">.env</code>):
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-slate-300">
{`WHMCS_API_SECRET=long-random-secret-min-32-chars
NEXT_PUBLIC_WHMCS_URL=${whmcsUrl}
NEXT_PUBLIC_APP_URL=${base}
PANEL_API_SECRET=panel-validate-secret`}
            </pre>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Redeploy or restart <code className="text-violet-300">nexlify-web</code> after changing env.
            </p>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">3. Map WHMCS products to plans</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Run <code className="text-violet-300">npm run db:seed</code> on the website. Default mapping:
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-[var(--muted)]">
              <li>WHMCS product ID <strong>1</strong> → Starter</li>
              <li>WHMCS product ID <strong>2</strong> → Main</li>
              <li>WHMCS product ID <strong>3</strong> → Top Tier</li>
            </ul>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Create matching products in WHMCS Admin → Products/Services with those IDs (or update{" "}
              <code className="text-violet-300">whmcsProductId</code> in the database).
            </p>
            <p className="mt-4 text-sm font-medium text-white">Plugin addon products (same WHMCS module)</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--muted)]">
              <li>ID <strong>4</strong> → Plex</li>
              <li>ID <strong>5</strong> → Emby</li>
              <li>ID <strong>6</strong> → Jellyfin</li>
              <li>ID <strong>7</strong> → YouTube</li>
              <li>ID <strong>8</strong> → Spotify</li>
              <li>ID <strong>9</strong> → Apple Music</li>
              <li>ID <strong>10</strong> → Deezer</li>
              <li>ID <strong>11</strong> → YouTube Music</li>
              <li>ID <strong>12</strong> → Statistics</li>
              <li>ID <strong>14</strong> → Media Pack (Plex + Emby + Jellyfin)</li>
              <li>ID <strong>15</strong> → Music Pack</li>
              <li>ID <strong>16</strong> → Full Plugin Pack</li>
            </ul>
            <p className="mt-3 text-sm text-[var(--muted)]">
              When a customer buys an addon or bundle, Nexlify records entitlements for each included plugin.
              After they activate their panel license, the panel syncs addon rows automatically (License → Addon
              Licenses).
            </p>
          </section>

          <section id="music-relay" className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">Music relay (full-length streaming)</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Spotify, Deezer, and Apple Music use the Nexlify music relay for full-track playback (not
              30-second previews). <strong>Nexlify-hosted panels</strong> are pre-configured — connect your
              music API keys in the panel and sync playlists.
            </p>
            <p className="mt-3 text-sm text-[var(--muted)]">
              <strong>Self-hosted panels:</strong> install the relay with{" "}
              <code className="text-violet-300">bash deploy/install-music-relay.sh</code> (port{" "}
              <strong>8788</strong> via PM2). The installer sets panel env vars automatically.
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-[var(--muted)]">
              <li>
                Panel <code className="text-violet-300">.env</code> (auto-set by installer):{" "}
                <code className="text-violet-300">MUSIC_RELAY_BASE_URL=http://127.0.0.1:8788</code>
              </li>
              <li>
                Relay <code className="text-violet-300">.env</code>: set{" "}
                <code className="text-violet-300">RELAY_API_KEY</code> (same as panel{" "}
                <code className="text-violet-300">MUSIC_RELAY_API_KEY</code>)
              </li>
              <li>
                Deezer: add <code className="text-violet-300">DEEZER_ARL</code> cookie from your browser
              </li>
              <li>
                Requires <code className="text-violet-300">yt-dlp</code> and{" "}
                <code className="text-violet-300">spotdl</code> on the host
              </li>
            </ul>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-violet-200">
              curl http://127.0.0.1:8788/health
            </pre>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">4. Add a WHMCS server</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              WHMCS Admin → <strong>System Settings → Servers → Add New Server</strong>.
              In the <strong>Module</strong> dropdown, choose <strong>StreamForge Panel License</strong>
              (scroll past cPanel/Plesk — it is a custom module, not a control panel).
            </p>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-[var(--muted)]">
              <li>
                <strong>Name:</strong> Nexlify licenses (any label)
              </li>
              <li>
                <strong>Hostname:</strong> <code className="text-violet-300">nexlify.live</code> (no{" "}
                <code className="text-violet-300">https://</code> — WHMCS rejects that as invalid port format)
              </li>
              <li>
                <strong>Port:</strong> <code className="text-violet-300">443</code>
              </li>
              <li>
                <strong>Secure / SSL:</strong> enabled
              </li>
              <li>
                <strong>IP address:</strong> leave blank
              </li>
              <li>
                <strong>Username:</strong> leave blank
              </li>
              <li>
                <strong>Password:</strong> same value as <code className="text-violet-300">WHMCS_API_SECRET</code>
              </li>
              <li>
                <strong>Type:</strong> choose the module <strong>StreamForge Panel License</strong> (streambilling)
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">5. Attach module to products</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              For each panel <em>and addon</em> product: <strong>Module Settings</strong> → Module{" "}
              <strong>StreamForge Panel License</strong> → select the server from step 4 → set{" "}
              <strong>Product ID</strong> to match seed (1–3 for plans, 4–16 for plugins and bundles).
            </p>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">6. Test the API</h2>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-violet-200">
{`curl -X POST ${base}/api/whmcs \\
  -H "Content-Type: application/json" \\
  -H "x-whmcs-api-key: YOUR_WHMCS_API_SECRET" \\
  -d '{"action":"create","serviceId":"test-1","productId":1,"email":"you@example.com"}'`}
            </pre>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Response includes <code className="text-violet-300">licenseKey</code> — show it in WHMCS client
              area email templates or a custom field.
            </p>
          </section>

          <section className="glass rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold text-white">Lifecycle</h2>
            <table className="mt-3 w-full text-left text-sm text-[var(--muted)]">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-2 pr-4">WHMCS</th>
                  <th className="py-2">Effect</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">Create</td>
                  <td className="py-2">Issues XSTR-… key</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">Renew</td>
                  <td className="py-2">Extends expiry</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">Suspend / Unsuspend</td>
                  <td className="py-2">Pauses or restores key</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Terminate</td>
                  <td className="py-2">Revokes key</td>
                </tr>
              </tbody>
            </table>
          </section>

          <p className="text-sm text-[var(--muted)]">
            Full module notes:{" "}
            <code className="text-violet-300">whmcs/modules/servers/streambilling/README.md</code> in the repo.
            Questions?{" "}
            <Link href="/support" className="text-violet-400 hover:underline">
              Open a ticket
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
