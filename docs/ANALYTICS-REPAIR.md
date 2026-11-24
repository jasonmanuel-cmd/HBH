# HBH analytics recovery

Both public domains were serving the HBH Vercel project. The old collector posted to the Standard alias, which routed back into the same collector. The HQ summary request also targeted the Standard alias. The original independent implementation in the harbison1 repository used Supabase sessions and visits. Those records were left in place; an export from the paused database is required to import historical traffic.

New consented page views and active time are written directly to the Call Harbison Neon project. The website partition is chosen from the request host. HQ reads the same table without an outbound request to either website. Page retries update one row, and engagement can only increase up to 30 minutes per page. The collector logs an opaque request ID, known site, event type and restricted error code. It stores no IP, referrer URL, form fields or campaign parameters.

The collector accepts only sitemap paths with privacy pages excluded. Clarity is limited to the canonical Call Harbison hosts and excluded on private pages and URLs containing query strings or fragments. Public page text and lead forms carry the strictest page-level mask; contact clicks are reported as event names only. The Clarity project setting is managed separately.

To pause writes, set HBH_ANALYTICS_DISABLED=true for production on Vercel and redeploy the repaired release. HQ can still read previously recorded rows. The new analytics table is additive and can remain in place. Avoid restoring the release that forwarded to the Standard alias, as that would restore the loop. Keep DATABASE_URL configured so lead intake and HQ continue to use Neon.

## Clarity Client API audit

The production baseline on the Call Harbison project loaded the bootstrap queue and then replaced it with the initialized Microsoft client. A consented browser visit sent SMS and email event names in an accepted collection upload. Form errors and form starts and calculator interactions were absent from the old Clarity allowlist. The old implementation also sent commands based on function existence alone, so it could not distinguish initialization from the bootstrap queue. A missing Smart Events row does not establish failed transport. Capture Playwright request bodies, decode gzip in memory, and report only the presence of known event names and tags.

The release tagged hbh-clarity-v2 waits for the initialized function, then sends Consent V2 with analytics granted and ads denied. It emits allowlisted event names, fixed website and release tags, a two-value language tag, a normalized page type, and an interaction tag that contains only an approved event name. Form starts and errors, calculator interactions, and newly accepted inquiries use the upgrade API. One dispatch per event type per page prevents repeated clicks or form errors from enqueuing duplicates. The inquiry sender keeps its existing duplicate suppression.

Keep Strict masking and the consent gate enabled. The loader remains absent on excluded pages and ignores query strings and fragments. Do not use Clarity Identify or send form or CRM values. The Microsoft dashboard may lag behind acknowledged collection uploads. Compare a matching recording, filter, or Smart Event before claiming dashboard visibility.

API reference: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api
Consent V2: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2
