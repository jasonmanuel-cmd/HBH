# Harbison Buys Homes

Website for Harbison Buys Homes — "Property problem? Call Harbison." Static pages plus one serverless API for the lead form, built for Vercel.

## What's included

| Page | URL |
| --- | --- |
| Home (hero + lead form, approach, situations, process, direct-vs-listing comparison, FAQ) | `/` |
| Situations overview | `/situations` |
| 8 situation pages (inherited, repairs, vacant, tenants, relocation, life change, fire/water, unfinished remodel) | `/situations/<slug>` |
| Service-area pages | `/areas/bakersfield`, `/areas/tehachapi`, `/areas/kern-county` |
| Thank-you (post-submit), Privacy, Terms, 404 | `/thank-you`, `/privacy`, `/terms` |

Also: lead form API (`/api/leads`), `sitemap.xml`, `robots.txt`, favicon, Open Graph tags, Schema.org JSON-LD (business, FAQ, breadcrumbs), optional GA4, a sticky mobile call bar, a spam honeypot, and UTM tracking on leads.

## Project layout

```
site.config.mjs     ← phone, email, service area, site URL (edit once, used everywhere)
src/content.mjs     ← all page copy: situations, areas, FAQs, form options, images
src/templates.mjs   ← HTML layout and page templates
static/             ← styles.css, script.js, logo, favicon (copied as-is)
api/leads.js        ← Vercel serverless function that receives the form
build.mjs           ← generates ./dist
supabase/schema.sql ← optional leads table
```

## Local development

```bash
npm run dev    # builds and serves http://localhost:3000 (API included)
npm test       # lead API tests
```

No dependencies to install. Node 18+.

## Deploy to Vercel

1. In Vercel: **Add New → Project → Import** `jasonmanuel-cmd/HBH`. Settings are read from `vercel.json` (build: `npm run build`, output: `dist`) — no changes needed.
2. Add environment variables (Project → Settings → Environment Variables). See `.env.example`. Set **at least one** lead destination:
   - **Email alerts (recommended):** `RESEND_API_KEY`, `LEAD_NOTIFY_EMAIL`, `LEAD_FROM_EMAIL` (sender on a domain verified in Resend).
   - **Database:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — run `supabase/schema.sql` first.
   - **CRM / SMS automations:** `LEAD_WEBHOOK_URL` (Zapier, Make, GoHighLevel, etc.).
   - `SITE_URL` (your final domain) and optional `GA_MEASUREMENT_ID`.
3. Redeploy after adding env vars, then add your custom domain under Project → Domains.

Until a destination is configured, leads are still accepted and written to Vercel's function logs (Project → Logs) so nothing is lost during setup.

## Before launch checklist

- [ ] Set `SITE_URL` to the real domain
- [ ] Configure a lead destination and submit a test lead
- [ ] Swap Unsplash stock photos (in `src/content.mjs`) for real local project photos
- [ ] Review copy, FAQ answers, and the Privacy/Terms pages (have an attorney review — especially the SMS consent language)
- [ ] Submit `sitemap.xml` in Google Search Console; set up Google Business Profile
