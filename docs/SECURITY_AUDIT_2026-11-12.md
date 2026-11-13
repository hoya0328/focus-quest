# Focus Quest security audit — 2026-11-12

## Scope

- Local source, reachable Git history and the Vinext/Cloudflare build output
- Supabase table, RPC and Storage migration boundaries
- Local and currently deployed Cloudflare Worker API behavior
- Runtime and development dependencies
- No paid service, persistent test account, production data mutation, key rotation or deployment

## Result matrix

| Boundary | Result | Evidence |
| --- | --- | --- |
| Secrets in source, Git history and build output | PASS | No service-role key, OpenAI key, Cloudflare token, private-key marker or high-confidence secret value was found. `.env.local` is ignored and untracked. |
| Dependency vulnerabilities | PASS | `npm audit --audit-level=low` reports 0 vulnerabilities after the Next, React, Vinext, Vite, Wrangler and affected transitive packages were updated. |
| TypeScript, ESLint and application tests | PASS | TypeScript and full ESLint pass. Logic/security tests 31/31 and rendered-server tests 2/2 pass. |
| Table ownership model | PASS (static) | RLS is enabled for cloud state, subjects, quests, sessions and materials. Policies use `auth.uid() = user_id`; owned composite foreign keys prevent cross-user subject/quest references. |
| RPC boundary | PASS (static) | `complete_study_quest_set` is `security invoker`, has an empty search path, is revoked from `anon`, granted only to `authenticated`, and checks ownership. |
| PDF Storage boundary | PASS (static) | `study-materials` is private, PDF-only and limits read/upload/delete to the authenticated user's UUID path prefix. |
| Public Worker without D1 | PASS (local patched build) | Anonymous and forged `oai-authenticated-user-email` requests both receive `404` before identity headers are read; API responses include `Cache-Control: no-store`. |
| Browser security headers | PASS (local patched build) | CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and a restrictive `Permissions-Policy` are attached by the Worker. |
| Currently deployed anonymous cloud-state request | PASS (old deployment) | The public Worker returns `401` for an ordinary anonymous request. |
| Currently deployed forged identity header | FAIL (old deployment) | The public Worker returns `503`, revealing that the untrusted identity header was processed before the missing D1 binding. The local patch fixes this, but it has not been deployed. |
| Live Supabase anonymous/owner/non-owner checks | NOT TESTED | The configured project hostname has the correct shape but does not resolve in DNS (`ENOTFOUND`). A network failure is not accepted as an authorization denial. |

## Repairs completed locally

- Reject cloud-state requests before reading ChatGPT identity headers when the Worker has no private D1 binding.
- Add `Cache-Control: no-store` to every cloud-state response.
- Add production security headers at the Worker boundary.
- Expand static authorization regression tests across tables, owned foreign keys, RPC execution and private PDF Storage.
- Expand rendered-server tests for anonymous and forged-header behavior.
- Replace raw `<img>` usage with `next/image` while preserving the original pixel-art dimensions.
- Restore the corrupted local Next package, update the vulnerable dependency graph and move scripts to the supported Vite/Vinext commands.
- Keep Phaser and PDF.js in separate lazy chunks; the large-chunk budget now documents those deliberate optional runtimes.

## Remaining external verification

The following checks require a valid active Supabase project URL and publishable/anon key plus two disposable ordinary user sessions:

1. Owner A insert/read/update/delete positive controls.
2. Account B denial against A's subjects, quests, sessions and PDF object paths.
3. Authenticated RPC completion and collision behavior.
4. Owner PDF download and non-owner denial.

No accounts or persistent fixtures were created during this audit. The current public Worker also remains on the previous deployment until publication is explicitly requested.

## Reproduction

```powershell
npm audit --audit-level=low
npm run security:anonymous
npm run test:logic
npx tsc --noEmit
npm run lint
npm test
```

`npm run security:anonymous` is read-only. Empty anonymous results are a pass; DNS or other network errors are `NOT TESTED`, not an authorization pass.
