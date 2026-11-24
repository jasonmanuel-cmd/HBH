# HBH analytics recovery

Both public domains were serving the HBH Vercel project. The old collector posted to the Standard alias, which routed back into the same collector. The HQ summary request also targeted the Standard alias. The original independent implementation in the harbison1 repository used Supabase sessions and visits. Those records were left in place; an export from the paused database is required to import historical traffic.

New consented page views and active time are written directly to the Call Harbison Neon project. The website partition is chosen from the request host. HQ reads the same table without an outbound request to either website. Page retries update one row, and engagement can only increase up to 30 minutes per page. The collector logs an opaque request ID, known site, event type and restricted error code. It stores no IP, referrer URL, form fields or campaign parameters.

The collector accepts only sitemap paths with privacy pages excluded. Clarity is limited to the canonical Call Harbison hosts and excluded on private pages and URLs containing query strings or fragments. Public page text and lead forms carry the strictest page-level mask; contact clicks are reported as event names only. The Clarity project setting is managed separately.

To pause writes, set HBH_ANALYTICS_DISABLED=true for production on Vercel and redeploy the repaired release. HQ can still read previously recorded rows. The new analytics table is additive and can remain in place. Avoid restoring the release that forwarded to the Standard alias, as that would restore the loop. Keep DATABASE_URL configured so lead intake and HQ continue to use Neon.
