# Focus Quest security audit — 2026-11-12

## Scope

- Local source and reachable Git history on `main`
- Vinext/Cloudflare production build output
- Supabase table, RPC and Storage migration policies
- Public Cloudflare Worker anonymous API boundary
- Production npm dependencies
- No paid service, persistent test account, production row mutation or key rotation

## PASS

- `.env.local` is ignored and untracked. It contains only the public Supabase URL, public anon key and Google-auth feature flag.
- No OpenAI key, Cloudflare token, Supabase service-role key, private-key marker or high-confidence secret shape was found in current source, reachable Git history or build output.
- Supabase SQL revokes `anon`, enables RLS and checks `auth.uid() = user_id` for cloud state, subjects, quests, sessions and materials.
- Owned composite foreign keys prevent a quest or session from referencing another user's subject or quest.
- `complete_study_quest_set` is `security invoker`, has an empty search path and is executable only by `authenticated`.
- The `study-materials` bucket is private, PDF-only and limits select/insert/delete to the authenticated user's UUID path prefix.
- The public Worker does not bind the private Sites D1 database. Anonymous `GET /api/cloud-state` returned HTTP `401`.
- Production dependencies were updated to Next.js `16.4.6`, Sharp `0.35.5`, source-map-js `1.2.2` and baseline-browser-mapping `2.11.0`. `npm audit --omit=dev` reports zero vulnerabilities.
- PDF/quest tests: 11 passed. Account/auth tests: 15 passed. TypeScript, ESLint and production build passed.

## FAIL

- The configured Supabase project host does not resolve in DNS. Authentication, account cloud state, quests, PDF metadata and private Storage cannot be verified or used until `.env.local` is updated from the active Supabase project's current API settings.

## NOT TESTED

- Real owner A read/insert/update/delete positive controls against production Supabase
- Unrelated account B attempts against owner A rows and PDF paths
- Authenticated RPC execution and session-id collision behavior with two ordinary user JWTs
- Storage owner download and non-owner denial using real objects

These checks require two disposable ordinary accounts and synthetic fixtures. They were not created during this audit to avoid emails and persistent production data.

## Reproduction

```powershell
npm audit --omit=dev
npm run security:anonymous
npm run test:pdf
npm run test:account-sync
npx tsc --noEmit
npm run lint
npm run build
```

`npm run security:anonymous` is read-only. It should return empty anonymous results for every Supabase table and Storage list, plus HTTP `401` for the public Worker cloud-state API. A network error is not accepted as an authorization denial.
