# Project record — October 16, 2026

## Changes made and files affected

- Unified new inquiries from both websites in Call Harbison HQ. Files:
  `api/intake.js`, `lib/shared-intake.js`, `api/leads.js`, `api/hq.js`,
  `static/hq/app.js`, `static/hq/index.html`, `.env.example`.
- Added brand labels/filtering and preserved Standard buyer requirements and
  submitted messages in notes and an initial activity snapshot. Missing property
  addresses are not invented. Public forms cannot impersonate the private bridge.
- Added Standard's existing analytics to Website stats, using server-to-server
  authentication and the existing database. Files: `api/hq.js`,
  `static/hq/analytics.js`, `static/hq/index.html`, `static/hq/app.js`.
- Added guarded cleanup for recognized fake records: `lib/demo-leads.js`,
  `api/hq.js`. Nine explicitly selected QA/test records were backed up and removed
  from production; their associated activity follows the existing cascade.
- Added local bridge/mock support and tests: `dev.mjs`, `dev/mock-supabase.mjs`,
  `test/shared-intake.test.js`, `test/central-hq.test.js`.
- Updated `README.md`, `.env.example`, `docs/SHARED-CRM.md`. This records-only
  follow-up adds this file and corrects the runbook's outdated “links” wording to
  “redirects”; no application behavior changes in this follow-up.
- Companion Standard files: `src/pages/api/lead.ts`,
  `src/lib/server/shared-crm.ts`, `src/components/InquiryForm.astro`,
  `src/pages/api/hq/analytics.ts`, `src/pages/hq/index.astro`,
  `src/pages/hq/dashboard.astro`, `src/pages/api/hq/leads.ts`,
  `src/components/hq/Dashboard.tsx`, `astro.config.mjs`, `vercel.json`,
  `package.json`, `test/shared-crm.test.mjs`, `.env.example`, `README.md`.
- Configured server-only bridge credentials in Vercel and reset/verified the HQ
  password as requested. Passwords, tokens and credential values are not recorded here.

## Checks performed and actual results

| Check | Actual result |
|---|---|
| HBH tests | 40 passed, 0 failed |
| HBH build | Passed; 35 public HTML pages generated |
| Standard tests | 3 passed, 0 failed |
| Standard type check | 0 errors, 0 warnings, 10 existing hints |
| Standard build | Passed |
| Private live storage diagnostics | Both sites returned 200 with `verified=true`, `cleaned=true`; synthetic records were read and removed without notifications |
| HQ password/login | Login and authenticated session checks returned 200 after the requested reset |
| Production cleanup | 9 test records deleted, 0 skipped; recheck found 0 recognized test records and 0 central leads |
| Dashboard after cleanup | New today, open pipeline and new 30-day leads all 0 at that check |
| Standard HQ routes | `/hq` and `/hq/dashboard`: 308 directly to `https://www.callharbison.com/hq` |
| Unauthorized Standard analytics | 401; endpoint was not redirected |
| Authenticated shared analytics | 200; 30-day snapshot was 563 sessions, 234 daily visitor hashes, 441 page views |
| Local desktop/mobile browser | Login, 7 metric cards, 13 breakdowns, date switch and error state passed; no page errors or horizontal mobile overflow |
| Production browser | Redirect, authenticated stats, displayed/API count agreement, 7-day selection and empty lead list passed; no page errors |

Records-update review: the staged changes contain documentation only;
`git diff --cached --check` passed in both repositories. A credential-pattern scan
of all four intended documentation files found zero matches. Passwords, session
files, backups and deletion receipts were not staged.

Counts and deployment states above are dated observations. Real leads and visits
will change them. Application tests were not rerun for this documentation-only
follow-up; the intended diff, whitespace and credential patterns are reviewed before commit.

Previous implementation releases: [HBH #6](https://github.com/jasonmanuel-cmd/HBH/pull/6),
[HBH #7](https://github.com/jasonmanuel-cmd/HBH/pull/7),
[Standard #4](https://github.com/jasonmanuel-cmd/harbison1/pull/4),
[Standard #5](https://github.com/jasonmanuel-cmd/harbison1/pull/5).
Current implementation baselines: HBH `a5841ead567c44f4dd3600aebfcd700388289e68`;
Standard `e084394069b5cb9b6329bcc22286a07af4ebce73`.

## Remaining problems

- Actual notification receipt from a public form has not been verified in production.
- Historical Standard leads remain in their original database; no import was performed.
- Website stats shows Standard traffic; Call Harbison GA4 traffic is not integrated.
- Shared-password team access lacks individual permissions. Durable retries, public
  lead throttling and submission-bound optional-details authorization remain future work.
- The original audit's testimonial provenance and inventory/copy issues remain outside scope.
- The last observed Actions failure was a billing lock before jobs ran. Current
  billing status was not rechecked for this records update; local tests and Vercel
  production builds passed independently.
- Broker review, marketing-number routing and customer-message activation remain pending.

## Next concrete action

Coordinate a labeled public-form test on each site with Nathanael and verify both
the HQ record and notification receipt. Remove/mark those test records afterward.
Then prepare a backed-up, duplicate-aware import of historical Standard leads.

## New decisions and corrections

- Call Harbison HQ is the central CRM and login; Standard HQ redirects there.
- Keep Standard analytics storage in place and proxy only aggregates. No database
  schema migration, new service-role keys or credential exposure was required.
- The user confirmed “face data” meant fake/demo/test records. The initial eight
  obvious matches became nine after validating the QA probe's reserved email and
  fictional phone. Ordinary contacts were not eligible for deletion.
- Buyer-profile extras remain in notes/activity snapshots for compatibility;
  they are visible but not individual structured database filter columns.
- Customer SMS requires explicit enablement and response consent; no customer
  message sequence, missed-call automation or phone routing was activated.
- The requested password was changed and verified; it remains a Vercel secret.
- Ignored local backup `.env.hq-demo-backup.local` and deletion receipt
  `.env.hq-cleanup-result.local` are deliberately retained outside Git. Temporary
  password/session verification files were removed. Never publish the backups or secrets.

Cross-project record: [Standard status](https://github.com/jasonmanuel-cmd/harbison1/blob/main/SHARED-CRM-STATUS.md).
