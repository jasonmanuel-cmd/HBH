# Shared Harbison CRM

Destination: **https://www.callharbison.com/hq**. Both websites use the existing HBH `leads` table, pipeline and team login. No schema changes or new Supabase service keys are needed.

## Routing

Harbison Standard form → Standard `/api/lead` → authenticated HTTPS POST to Call Harbison `/api/intake` → existing Supabase `leads` → Call Harbison HQ.

Call Harbison forms → existing `/api/leads` → the same Supabase `leads` → the same HQ.

Standard keeps its current email notification and analytics database. When the bridge is configured, new Standard leads are **not** written to its old lead table. Its analytics dashboard links to the shared CRM, and its old lead mutation APIs reject edits. Historical Standard leads are retained in their original database; this change does not migrate them.

The trusted Standard bridge assigns `form_type=harbison_standard`. Other existing form types belong to Call Harbison. HQ uses this marker for brand labels, brand filters and counts. Public Call Harbison submissions cannot choose the trusted marker.

For schema compatibility, Standard's buyer profile and original message are preserved as labeled text in `notes`, with an initial activity snapshot in `lead_events`. HQ displays the snapshot separately from editable notes. Source URL, campaign fields, inquiry type, timeline, contact details and assignee use existing columns. Missing property addresses remain empty, and HQ does not show a map action for them. Original profile fields are visible but are not separate database filter columns.

## Configuration and release order

1. Generate a random secret of at least 32 characters. Keep it out of source control and browsers.
2. On **hbh**, configure server-only `CRM_INGEST_SECRET` and deploy the HBH change first.
3. On **harbison1**, set `SHARED_CRM_URL=https://www.callharbison.com/api/intake` and `SHARED_CRM_SECRET` to the same secret, then deploy Standard.
4. Keep Standard's current `SUPABASE_*` values for analytics. Do not replace them with HBH credentials.
5. Verify authenticated storage through the private bridge, then confirm a controlled inquiry from each public website in HQ. Public submissions may send real staff notifications, so use a coordinated test.

An authenticated POST of `{ "kind": "verify" }` to the private bridge inserts a server-generated, clearly marked test inquiry as spam, reads it back, and deletes that exact test record. It sends no notifications and cannot accept a caller-specified deletion target. Success requires `verified: true` and `cleaned: true`.

Only production should use production intake credentials. Use separate secrets and a test database for preview/development. Requests with missing or wrong credentials are rejected. The bridge does not return the secret, service key or customer data.

Submission UUIDs make Standard bridge retries idempotent: duplicate retries cannot overwrite staff edits. If the shared CRM fails, Standard reports partial email-only delivery or its existing fallback; it does not silently write a second CRM. No durable retry queue is introduced by this change. Both existing notification providers remain separate delivery paths.

## Roles, handoff and approval

New bridge leads are assigned to `nathanael`; existing Call Harbison leads retain the database's existing assignment behavior. Marketing/intake staff organize submissions and coordinate follow-up. Real estate advice, pricing, negotiations and contracts go to Nathanael. The current HQ login is shared team access; recording a display name is not a distinct permission boundary or a role-based access system.

The proposed marketing/general inquiry number **661-201-4994** is recorded for broker review. This release does not replace the public professional phone number or configure call forwarding, missed-call texting or call-to-CRM ingestion.

Customer SMS acknowledgments require **both** `LEAD_ACK_ENABLED=true` and recorded response consent, plus the existing Twilio configuration. The flag defaults off. No message sequence or missed-call automation is introduced. Staff email alerts remain in place.

Proposed acknowledgment for broker review:

> Thank you for contacting [brand]. We received your inquiry and will forward it to Nathanael Harbison for follow-up. This is an automated acknowledgment.

Broker review still covers brand/brokerage identification, personal-platform marketing, the intake number, form fields, consent wording, acknowledgment conditions and handoff. Website submission does not create a marketing opt-in for Standard inquiries.

## Checks

- `npm test`: existing HBH coverage plus authenticated intake, failure handling, duplicate suppression, preservation of buyer information, public brand-spoof prevention and a two-brand HQ integration test.
- `npm run build`: generated public pages and HQ assets.
- In Standard: `npm test`, `npm run check`, `npm run build`.

The integration test uses a local mock database and no real notifications. Deployed secrets, live provider delivery, old-lead migration and broker approval must be recorded separately before describing them as verified.
