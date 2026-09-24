# Harbison Buys Homes

Website for Harbison Buys Homes — "Property problem? Call Harbison." Static pages plus one serverless API for the lead form, built for Vercel.

## What's included

| Page | URL |
| --- | --- |
| Home (hero + lead form, approach, situations, process, direct-vs-listing comparison, FAQ) | `/` |
| Situations overview | `/situations` |
| 11 situation pages (inherited, repairs, vacant, tenants, relocation, life change, fire/water, unfinished remodel, rental property, failed listing, land/development) | `/situations/<slug>` |
| Service-area pages | `/areas/bakersfield`, `/areas/tehachapi`, `/areas/stallion-springs`, `/areas/california-city`, `/areas/kern-county` |
| About Nathanael Harbison (credentials, E-E-A-T) | `/about` |
| Seller guides (as-is sales, cash vs. listing, inherited homes, renovate vs. as-is, what affects a cash offer, the walkthrough) | `/guides`, `/guides/<slug>` |
| How it works (process, walkthrough, offer math, seller promise), Contact, Accessibility | `/how-it-works`, `/contact`, `/accessibility` |
| Thank-you (post-submit), Privacy, Terms, 404 | `/thank-you`, `/privacy`, `/terms` |

Also: lead form API (`/api/leads`), `sitemap.xml`, `robots.txt` (AI crawlers explicitly allowed), `llms.txt`, favicon, Open Graph/Twitter tags, a connected Schema.org `@graph` on every page (RealEstateAgent, Person with DRE license credential, WebSite, WebPage, Service, Article, BreadcrumbList, FAQPage), answer-first "Quick answer" blocks, an "At a glance" facts section, optional GA4, a sticky mobile call bar, a spam honeypot, and UTM tracking on leads.

## Project layout

```
site.config.mjs     ← phone, email, service area, site URL (edit once, used everywhere)
src/content.mjs     ← situations, areas, FAQs, form options, images
src/content-extra.mjs ← About page, guides, testimonials, "at a glance" facts, California City page
src/content-playbook.mjs ← site-playbook content: hero, 5 paths, seller promise, offer explanation, form options, new pages
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

## SEO / AI-search maintenance

- **Keep facts identical everywhere.** Name, phone, email, and service area must match on this site, harbisonstandard.com, Google Business Profile, Facebook, Yelp, etc. AI engines trust consistent facts.
- **Create a Google Business Profile** (service-area business, category "Real estate agent" or "Home buyer"), then add its URL to `businessProfiles` in `site.config.mjs`.
- **After launch:** verify the domain in Google Search Console and Bing Webmaster Tools (Bing feeds ChatGPT/Copilot search) and submit `/sitemap.xml`.
- **Add a guide every month or two** in `src/content-extra.mjs` — answer-first, question-style headings. Update the `updated` date when you revise one.
- **Reviews:** ask each seller for a Google review. Do not add review star markup to this site (Google ignores self-hosted reviews for local businesses).
- The guides are general information written for Nathanael to review. Once he has reviewed them, the byline can be changed to him.

## Lead form (options form)

Three steps, per the site playbook: **situation → address (street, city, ZIP) → contact + consent**. The lead is created at step 3. Timeline, occupancy, condition, and goals are asked afterward on `/thank-you` and attached to the same lead (`{ kind: 'details' }` → `/api/leads`). Transactional consent (required) and marketing consent (optional) are stored separately. The database lives in the Supabase project **harbison-buys-homes** (shared with the Lead Desk app; the website only adds `leads`, `partners`, `lead_events`, `ad_spend`, and `v_*` views). `schema.sql` and migrations 002–004 were applied on 2026-09-24 as `website_001`–`website_004`.

Analytics events (GTM/GA4, no personal data): `phone_click`, `cta_click`, `lead_form_view`, `lead_form_start`, `lead_form_step_complete`, `lead_form_submit`, `lead_form_error`, `lead_form_success`, `generate_lead`, `guide_view`, `situation_page_view`, `location_page_view`.

## Brand assets

`static/assets/` holds the logo cut from the brand sheet: `logo-horizontal.png` (full color, transparent), `logo-header-reverse.png` (ivory + gold for navy), `logo-symbol-gold.png`, app/favicon icons, and `og-default.jpg`. For the sharpest icons, replace them with exports from the original vector logo file when available.

## HQ panel (dashboard + CRM) — `/hq`

Private, password-protected team panel at **https://www.callharbison.com/hq**.

- **Dashboard:** leads waiting for first contact, follow-ups due, new today / 7 days, open pipeline, appointments, median time to first contact, gross profit (90 days), leads per week, pipeline by stage, source, and path of interest.
- **CRM:** filter (open, new, follow-ups due, closed, all) and search; open a lead to call/text/email/map, see everything they submitted, change stage, set follow-up and appointment, record values and outcome, add notes and call logs, and see the activity timeline.
- **Setup:** in Vercel set `HQ_PASSWORD` (long and unique) plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. Changing the password signs everyone out.
- **Security:** one `/api/hq` function; signed HttpOnly/Secure/SameSite=Strict session cookie (12 hours); failed-login throttling; writes require the panel's own header; edits are whitelisted and validated; the database key never reaches the browser; `/hq` is noindex and blocked in robots.txt.
- **Try it locally with sample data:** `npm run dev -- --mock`, open http://localhost:3000/hq, password `demo`.
