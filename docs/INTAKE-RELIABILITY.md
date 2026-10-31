# Public seller-intake reliability

This change is for review; it does not enable an ad campaign, modify production
configuration, migrate a database, or perform a real lead submission.

## Guarantees and limits

- The browser assigns a version-4 UUID submission reference and retains it in
  session storage (or page memory when storage is blocked) until a successful
  response. No contact data is added to this new storage entry. Reload recovery
  requires session storage; a new browser/tab cannot promise the same reference.
- Supabase's existing `leads.id` primary key atomically arbitrates insertion with
  `resolution=ignore-duplicates,return=representation`. No migration is required.
  The API never merges a public retry into an existing row.
- Only the winning insert proceeds to alerts. Duplicate requests read and compare
  stored submitted fields (excluding the generated consent timestamp) before
  returning success and a new expiring details reference. Changed contact,
  consent or other submitted fields, including staff edits after submission,
  cause a safe conflict asking the visitor to call. Existing records are never
  overwritten and conflicts never trigger alerts or receive a details token.
- Database failure prevents notifications and acknowledgment texts. A saved lead
  remains successful even if alerts fail. HQ receives a best-effort sanitized
  warning when possible; the warning request has a bounded timeout and its HTTP
  status is checked. Provider details and customer data are not logged in this
  API's failure messages or returned in public errors.
- This is **one row and at-most-once notification attempt**, not exactly-once
  delivery. A process crash after storage, or an ambiguous insert response that
  is subsequently observed as duplicate, can leave a saved lead without alerts.
  Team members must monitor new/uncontacted HQ leads. Durable automatic recovery
  needs a transactional outbox and dispatch workflow, which are not included.
- Initial Resend alerts use `Idempotency-Key: lead-<UUID>` for bounded network
  retries. Resend documents a 24-hour window, not permanent deduplication:
  https://resend.com/docs/dashboard/emails/idempotency-keys . SMS and arbitrary
  webhook POSTs are not automatically retried because no provider-independent
  idempotency guarantee exists. A timeout can still mean the provider accepted
  the message. No automated replay of alerts is introduced.
- New browser submissions with a stable reference **require a complete Supabase
  configuration** and fail safely before providers if it is missing. Legacy
  callers without a reference retain existing email/webhook-only support, but
  cannot claim cross-request deduplication. Cached old clients similarly do not
  gain stable retries until refreshed.
- Missing-schema fallback still saves core fields rather than dropping an
  inquiry. A duplicate on that legacy schema cannot prove consent/payload
  equality, so it returns a safe conflict instead of fabricating success. Apply
  the project's pre-existing schema migrations before relying on full fields
  and retry recovery. This PR does not run them.
- Rate limiting remains per-instance, in memory. It is not global abuse
  protection; repeated requests may still receive 429. The client retains its
  reference on that error.

## Verification performed

Local tests use fake fixtures and mocked providers, never production/preview
credentials. Coverage includes concurrent duplicates, response loss/retry,
conflicting payload/consent, failed storage with no alerts, failed alert followed
by retry, generic public errors and sanitized logs. Build/test results are
recorded in the PR. This does not prove production provider delivery.

## Future approved live check — NOT executed

Preview currently may share production provider/database credentials. Do not
submit a preview form, call a number, or trigger a test alert as routine QA.
Before any live test, obtain explicit approval for the exact test identity,
property placeholder, destination inboxes/phones, environment and cleanup plan.
Prefer isolated test database and provider sandbox credentials. Verify a labeled
inquiry in HQ, notification receipt and response ownership; then perform only
approved cleanup. Never use an actual distressed owner's data as test input.
