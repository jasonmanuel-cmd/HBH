# Neon database

Leads, the HQ dashboard and the seller-operations tables can run on Neon instead of Supabase.

## How it works
- Set `DATABASE_URL` (Neon connection string) in Vercel and redeploy. With it set, `lib/neon.js` routes every
  `/rest/v1/...` call the handlers already make to `lib/neon-rest.js`, which runs it as SQL on Neon.
- Without `DATABASE_URL`, nothing changes and the site keeps using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `lib/neon-rest.js` supports only the PostgREST features this site uses (eq/neq/gt/gte/lt/lte/like/ilike/is/in/cs,
  not., or/and, order, limit/offset, select columns, on_conflict with ignore/merge duplicates, return=representation,
  PATCH, DELETE, rpc). Identifiers are validated and values are bound parameters. See `test/neon-rest.test.js`.

## Database
Project `call-harbison` (Neon id `green-sun-72811206`, region aws-us-west-2) has the full schema from `supabase/schema.sql`
and every file in `supabase/migrations/` applied, plus the `anon`, `authenticated` and `service_role` roles those
migrations grant to. New migrations must be applied to Neon as well as committed here.

## Cutover checklist
1. Neon console → project `call-harbison` → Connect → copy the pooled connection string.
2. Vercel → project → Settings → Environment Variables → add `DATABASE_URL` (Production).
3. Redeploy, then submit a test lead and confirm it appears in HQ.
4. Move any existing Supabase leads across (export `leads`, `lead_events`, `partners`, `ad_spend` as CSV and import them).
5. After a week without problems, remove the old Supabase variables.
