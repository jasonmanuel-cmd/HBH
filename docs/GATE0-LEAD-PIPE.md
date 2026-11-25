# Gate 0: lead pipe and entity lock

Date: 2026-11-25. Scope: Call Harbison repository only. This is a code handoff, not evidence that production alerts reach a person.

## Verified in source

- `/api/leads` now refuses success without configured database storage. Normal legacy submissions save first, then attempt Resend, webhook, or SMS delivery. Seller operations mode enqueues an alert in the database transaction. The public reliability command/outbox exists but remains in the source phase `preactivation`; its worker is manual and disabled.
- The legacy alert path is still at most once. A Resend 200 means provider acceptance, not inbox receipt or owner acknowledgement. A duplicate retry can succeed after the first attempt stored a lead but failed to alert. Production end-to-end delivery and acknowledgement remain unverified.
- Anonymous form telemetry sends only controlled page/form/step fields. It does not send entered names, phone numbers, email addresses, or property addresses. Submitted lead data is stored only after the form is sent.
- The California DRE public lookup dated 2026-11-24 lists Nathanael Harbison (02059393) as licensed under The Mora Partners Inc. (02227690). Current source uses that broker; no active `Compass` references were found. Historical CRM records for Harbison Standard retain their separate origin label.

## Canary release sequence

1. Apply `supabase/migrations/20261125010000_lead_canary.sql` to the isolated HBH lead database after backup. The canary preflights `is_test` before insertion and never uses the legacy missing-column fallback.
2. Confirm the production environment has database storage, `RESEND_API_KEY`, explicit `LEAD_NOTIFY_EMAIL`, verified `LEAD_FROM_EMAIL`, `CRON_SECRET`, and an independent `CANARY_FAILURE_WEBHOOK_URL`. Keep `ENABLE_AUTO_SMS=false` and `ENABLE_FORECLOSURE_PAGES=false`.
   The failure receiver accepts a plain-text HTTPS POST and receives no seller information. For a phone push receiver, the owner must subscribe and confirm receipt before the canary is enabled.
3. Set `LEAD_CANARY_ENABLED=true` only after the migration and failure receiver are verified. Vercel invokes `/api/lead-canary` at 16:00 UTC daily. Check the flagged row, owner alert provider receipt, failure receiver, and owner acknowledgement. Synthetic records are filtered from HQ reads and funnel views and are excluded from CRM webhook and SMS.
4. Exercise database outage, alert provider rejection, duplicate submission, and replay in a nonproduction environment. Confirm recovery ownership before enabling further conversion work.

The canary intentionally fails if seller operations mode is enabled, because its direct alert path cannot validate that mode's queued worker. A separate canary for the active queue and worker is required before activating seller operations.

## Execution record, 2026-11-25

- The Call Harbison Neon project `green-sun-72811206` had two lead rows and no `is_test` column before migration. The production Vercel project has `DATABASE_URL` configured, but Vercel does not export its secret value through this CLI session; the live canary must confirm the deployed app uses the migrated database.
- Created untouched restore branch `gate0-restore-2026-11-25` (`br-small-recipe-bfy7s0zp`) and expiring migration-test branch `gate0-migration-test-2026-11-25` (`br-crimson-pond-bfblbc3n`). The seven migration statements passed as one transaction on the test branch, then on main. Main retains two lead rows, has the `is_test` column, and has all four reporting views.
- Configured Production `LEAD_NOTIFY_EMAIL` for Jason and Nathanael; configured `CRON_SECRET` and an independent ntfy failure topic as Vercel secrets. `LEAD_CANARY_ENABLED`, `ENABLE_AUTO_SMS`, and `ENABLE_FORECLOSURE_PAGES` are explicitly false. A generic alarm test POST received HTTP 200, which does not establish that a person received a push notification.
- Keep the canary disabled until the owner subscribes to the independent alarm, confirms receipt, the updated code is deployed with the new environment, and a controlled live canary confirms storage plus owner alert receipt. Do not count provider acceptance as acknowledgement.

## Controlled canary, 2026-11-25

- Jason confirmed receipt of the independent ntfy alarm on his phone. A second generic alarm POST returned HTTP 200.
- Tested deployment `dpl_5zy8oXeJWiyPHFoqh5NK1NTgV1V2` without promoting it to the public domain. Its authenticated canary returned `stored=true` and `ownerAlertAccepted=true` for test lead `57c71114-2b13-4b42-bcfa-b4996b0575f5`.
- Direct Neon readback found that row with `is_test=true`, zero matching notification-outbox jobs, and zero matching rows in `v_uncontacted`. This confirms storage in the intended Neon project and exclusion from those two operational paths. Local tests cover HQ and funnel exclusion; live owner inbox receipt remains pending.
- Reset the Vercel Production project setting `LEAD_CANARY_ENABLED=false` after the controlled test. The public domain remains on disabled deployment `dpl_D7JQ1odHM7cdcdCYPnsHD2W2DLnF`. Do not enable the daily canary or promote the tested deployment until the owner confirms email receipt.

## Rollback

Disable `LEAD_CANARY_ENABLED` to stop synthetic writes. Revert the Gate 0 application commit and redeploy only while the lead reliability protocol remains in `preactivation`. Keep the additive `is_test` column and existing test rows until they have been reconciled; dropping them during rollback would remove exclusion evidence. Do not revert to a version that exposes the regulated pages or automated SMS after those flags have been activated.

Primary metric: stored, owner-alerted, acknowledged real seller inquiries per eligible submission. The code and local tests alone do not establish a production value for that metric.
