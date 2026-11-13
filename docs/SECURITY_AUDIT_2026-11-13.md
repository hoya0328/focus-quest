# Focus Quest security audit — 2026-11-13

## Scope

- Local source, reachable build output and dependency lockfile
- Supabase production project `uaqmmsuhnwupckakagmi`
- Table, RPC and private PDF Storage authorization boundaries
- Cloudflare Worker API configuration and pre-deployment behavior
- No paid security feature, persistent test account, production user deletion or key rotation

## Result matrix

| Boundary | Result | Evidence |
| --- | --- | --- |
| Supabase availability | PASS | The paused project was restored and reports `ACTIVE_HEALTHY`. |
| Production migrations | PASS | Five versioned migrations are recorded remotely through `202611130002`. |
| Anonymous table access | PASS | All eight private tables reject the anon role with `401`. |
| Anonymous PDF Storage access | PASS | The private `study-materials` bucket returns an empty list and no object metadata. |
| RLS event-trigger RPC exposure | PASS | `PUBLIC`, `anon` and `authenticated` execution was revoked from `public.rls_auto_enable()`. |
| Supabase Security Advisor | PASS with paid-plan exception | No errors remain. The only warning is leaked-password protection, which Supabase limits to Pro and above. |
| Secrets in source and build output | PASS | High-confidence scan found zero server keys, provider secret keys or private-key blocks. |
| Dependency vulnerabilities | PASS | `npm audit --audit-level=low` reports 0 vulnerabilities. |
| TypeScript and ESLint | PASS | `npx tsc --noEmit` and full `npm run lint` complete without errors. |
| Application tests | PASS | Logic/security 34, PDF 12, quests 14 and rendered-server 2 tests pass. |
| Cloudflare anonymous API behavior | PENDING DEPLOY | The validated local build rejects unavailable private cloud storage before reading identity headers. The old live deployment still returns `503` for a forged header until the new version is published. |

## Repairs applied

- Added owner-scoped progress, quiz-attempt and privacy-minimal product-event tables.
- Added an owner-checking, `SECURITY INVOKER` progress RPC with an empty search path.
- Added an authenticated account-deletion API that validates the bearer token and deletes private Storage objects before deleting the Auth user.
- Added server-only Cloudflare configuration boundaries; the service-role key is never public or committed.
- Removed public execution from the RLS event-trigger function while keeping the trigger active.
- Updated the anonymous audit script to distinguish explicit denial from an empty RLS result and to query each table's real identity column.

## Deliberately not exercised

- Owner-versus-other-account positive/negative controls need two ordinary disposable user sessions. No production accounts were created for an audit.
- The successful account-deletion path was not called because it irreversibly deletes a real Auth account and its PDFs.
- Leaked-password protection was not enabled because it requires a paid Supabase plan.

## Reproduction

```powershell
npm audit --audit-level=low
npm run security:anonymous
npm run lint
npx tsc --noEmit
npm test
npm run test:pdf
npm run test:quests
```

The rendered-server test needs normal access to Wrangler's user log directory on Windows; a sandbox denial is an environment failure, not an application failure.
