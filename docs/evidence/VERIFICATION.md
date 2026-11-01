# Verification record — 2026-11-01 UTC

- Final suite: **96 passed, 0 failed, 0 skipped**. Raw output: `test-results.txt`.
- Final build: **69 generated pages**. Raw output: `build-results.txt`.
- `node --check` passed for JavaScript files in api, lib, static/hq, dev and scripts. `git diff --check` passed (only ordinary CRLF normalization notices).
- `node scripts/process-outbox.mjs` with dispatch unset: "Notification dispatch is OFF. No database access or messages attempted."
- PostgreSQL tests apply the base schema and all migrations to isolated in-memory PGlite. Eight seller-operation tests contain the positive/negative scenarios listed in the runbook; the total count includes the existing 88 regression tests.

## Browser checks

Local loopback preview only, synthetic data, SQL-backed mock and blocked external server fetches. Final desktop and 390×844 mobile screenshots are `seller-operations-desktop.png` and `seller-operations-mobile.png`.

Verified final signed dry run, held research import, import button reset, unchanged inquiry counts, empty notification queue, explicit dispatch-OFF state, reload, repeated tab navigation, back/forward and logout. Earlier in this same implementation session, recording an actual synthetic conversation changed the inquiry to connected and increased its evidenced conversation/response sample. The final regression suite reverified that workflow after all cleanup.

Mobile measurement: innerWidth 390, document clientWidth 375 and scrollWidth 375 (vertical scrollbar accounts for the difference); no page-wide horizontal overflow. The existing HQ tab row scrolls horizontally. Viewport override was reset; local test tab and preview process were closed/stopped afterward.

## Independent read-only review

The native reviewer inspected authorization, research separation, SQL/RLS, duplicate/recovery behavior and tests. Findings fixed and rechecked:

1. Batch claims could start sending after lease expiry: claim one, require remaining lease, reject lost completion acknowledgement.
2. Overlength source identifiers could collide after truncation: reject instead of truncating.
3. Contact activity could reopen advanced/closed states: preserve stage; explicit reopen clears current closure state.
4. Lost HTTP response after committed reopen was not replayable: fingerprint replay lookup precedes current-state validation; altered payloads conflict and exact replay creates one event.

Reviewer reported no remaining substantive blocker in the focused code review. It did not independently rerun tests. Its remaining nuance: overlapping identical requests can race between replay lookup and validation and receive a transient conflict; a subsequent exact retry returns the recorded result without duplicating activity.

## Unrun / limits

Actual Supabase/PostgREST schema cache, grants/default privileges, Supabase advisors, independently overlapping PostgreSQL connections, real provider idempotency and inbox delivery are **unrun**. PGlite uses one connection; Promise.all does not establish actual SKIP LOCKED contention safety. No production readiness or exactly-once delivery claim. No lint/type-check scripts are defined beyond syntax checks. No real research candidates were imported. Production and provider configuration were untouched.
