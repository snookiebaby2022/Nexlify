# Nexlify security audit

Date: 2026-09-10 · Scope: `nexlify-panel` panel API + lib (not marketing/edge ops scripts).

Method: graft-assisted review of raw SQL, auth/IDOR, credits, XSS, path/cmd injection,
password handling, secrets leakage, CSRF, mass assignment — then fail→fix regression tests.

| ID | Severity | Status | Area | Summary |
|----|----------|--------|------|---------|
| SEC-01 | **High** | Fixed | Credits race | `debitResellerCredits` read-then-decrement without row lock / conditional update → parallel line creates can drive balance negative |
| SEC-02 | **High** | Fixed | Path traversal | `readLocalM3uFile` treated any path as allowed when `MEDIA_IMPORT_ROOT` unset (`\|\| !mediaRoot`) |
| SEC-03 | **Medium** | Fixed | Secret in response | Reseller `PATCH /api/reseller/users` echoed plaintext password in JSON |
| SEC-04 | **Medium** | Fixed | CSRF | State-changing panel APIs relied only on `SameSite=lax`; no Origin/Referer check in `guardAdminApiRequest` |
| SEC-05 | **Medium** | Fixed | XSS | `escapeHtml` existed but unused; Stalker channel `name` returned raw (STB/HTML consumers) |
| SEC-06 | **Low** | Fixed | AI orderBy | Voice/NL Prisma plans used unsanitized `orderBy` field names |
| SEC-07 | **Low** | Fixed | FFmpeg URL | Control chars / NUL in stream URLs still entered argv (shell-quoted but hostile to parsers) |
| SEC-08 | Info | OK | SQL injection | App `$queryRaw` ORDER BY paths use `Prisma.sql` literals / whitelist `streamListOrderBy` — no user string concat in panel hot path |
| SEC-09 | Info | OK | Privilege escalation | Reseller user PATCH cannot set `role` / `parentId` / `credits`; admin role changes require ADMIN session |
| SEC-10 | Info | OK | Password hashing | bcrypt cost 12 via `hashPassword`; no self-service reset-token flow found |
| SEC-11 | Info | OK | JWT | HS256 with `JWT_SECRET` strength checks; httpOnly cookie |

## Details

### SEC-01 — Credit debit race (High)
`src/lib/reseller-credit-charge.ts` loaded credits, checked `>= amount`, then `decrement` without `FOR UPDATE` or conditional `UPDATE … WHERE credits >= amount`. Two concurrent transactions each seeing balance 10 and debiting 10 → −10.

**Fix:** `updateMany({ where: { id, credits: { gte: amount } }, data: { decrement } })` and fail if `count !== 1`.

### SEC-02 — Local M3U path traversal (High)
`src/lib/watch-folder-m3u.ts` `readLocalM3uFile`:
`allowed = under(upload) || !mediaRoot || under(media)`.
When env unset, `!mediaRoot` short-circuits to allow reading any readable `.m3u` on disk (e.g. `/etc/passwd` renamed — or any `.m3u` under `/`).

**Fix:** Allow only under upload root, or under `MEDIA_IMPORT_ROOT` when set. Use `path.relative` confinement (same pattern as `confinePathToDir`).

### SEC-03 — Password echoed (Medium)
Reseller user PATCH returned `password: body.password` after hash update.

**Fix:** Always return empty `password` field (UI already treats blank as “unchanged”).

### SEC-04 — CSRF defense-in-depth (Medium)
Cookies use `sameSite: "lax"` (blocks classic cross-site form POST). Added Origin/Referer allowlist for mutating methods inside `guardAdminApiRequest`.

### SEC-05 — XSS hygiene (Medium)
Apply `escapeHtml` to Stalker channel display names. React admin UI remains text-node safe; helper is now used on the MAG JSON surface.

### SEC-06 / SEC-07
Whitelist AI `orderBy` keys; reject control characters in FFmpeg `inputUrl`.

## Residual / out of scope
- Ops scripts under `scripts/` / `tmp/` using `$queryRawUnsafe` with operator-controlled limits — not panel request path.
- Full IDOR matrix across ~342 routes — reseller line routes generally filter `ownerId`; expand in Phase 5 follow-up.
- No password-reset token to audit (feature absent).

## Regression tests
- `src/lib/security-audit.test.ts` — SEC-01…07 (+ bcrypt / mass-assignment smoke)
- `src/lib/admin-route-guard.test.ts` — CSRF Origin checks
- Also covered in `ai-prisma-plan.test.ts`, `ffmpeg-agent.test.ts`, `watch-folder-m3u.test.ts`
