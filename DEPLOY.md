# Deploy to nexlify.live

## VPS (85.17.162.54) — recommended for full control

See **[deploy/VPS-DEPLOY.md](deploy/VPS-DEPLOY.md)** and run:

```powershell
npm run deploy:vps
```

## Vercel (alternative)

1. Push this repo to GitHub.
2. Import project in [Vercel](https://vercel.com) → set **Production Domain** to `nexlify.live` and `www.nexlify.live`.
3. Environment variables (Production):

   | Variable | Value |
   |----------|--------|
   | `NEXT_PUBLIC_APP_URL` | `https://nexlify.live` |
   | `JWT_SECRET` | long random string |
   | `DATABASE_URL` | Postgres URL (use Vercel Postgres / Neon / Supabase) |
   | `WHMCS_API_SECRET` | your secret |
   | `NEXT_PUBLIC_WHMCS_URL` | `https://billing.nexlify.live/cart.php` |
   | `PANEL_API_SECRET` | panel API key |

4. DNS at your registrar:
   - `A` / `CNAME` for `nexlify.live` → Vercel
   - `www` → redirect handled by `next.config.ts`

5. After deploy:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

## SQLite note

Local dev uses SQLite. Production should use **PostgreSQL** — change `provider` in `prisma/schema.prisma` to `postgresql` and use `@prisma/adapter-pg`.

## Support tickets

Available at **https://nexlify.live/support** (login required). Admins: **/admin/tickets**.

## IPTV panel demo

Marketing page: **https://nexlify.live/demo**

1. Deploy your real panel at e.g. `https://panel.demo.nexlify.live`
2. Set env vars (see `.env.example` `NEXT_PUBLIC_DEMO_*`)
3. Point panel license API to `https://nexlify.live/api/licenses/validate`
4. Run `npm run db:seed` — creates demo license `XSTR-DEMO-NXLF-LIVE-PANEL`
5. DNS: `panel.demo` → your panel server
