# Harbison Buys Homes

Website for Harbison Buys Homes — "Property problem? Call Harbison." Static pages plus one serverless API for the lead form, built for Vercel.

## One CRM for both websites

Call Harbison HQ is the shared intake desk for this website and Harbison Standard.
The private `/api/intake` bridge accepts authenticated Standard inquiries into the
existing lead table. HQ labels and filters by brand, preserves Standard buyer
profiles and messages, and keeps one pipeline for follow-up. Set `CRM_INGEST_SECRET`
to the same 32+ character server-only secret as Standard's `SHARED_CRM_SECRET`.
Customer SMS remains off unless `LEAD_ACK_ENABLED=true` and response consent is
recorded. See [the shared CRM runbook](docs/SHARED-CRM.md) for configuration,
verification limits, historical leads and items still awaiting broker review.

## What's included

| Page | URL |
| --- | --- |
| Home (hero + lead form, approach, situations, process, direct-vs-listing comparison, FAQ) | `/` |
| Situations overview | `/situations` |
| 11 situation pages (inherited, repairs, vacant, tenants, relocation, life change, fire/water, unfinished remodel, rental property, failed listing, land/development) | `/situations/<slug>` |
| Service-area pages | `/areas/bakersfield`, `/areas/tehachapi`, `/areas/stallion-springs`, `/areas/california-city`, `/areas/kern-county` |
| About Nathanael Harbison (credentials, E-E-A-T) | `/about` |
| Seller guides (as-is sales, cash vs. listing, inherited homes, renovate vs. as-is, what affects a cash offer, the walkthrough) | `/guides`, `/guides/<slug>` |
| How it works (process, walkthrough, interactive net estimator, offer math, seller promise), Contact, Accessibility | `/how-it-works`, `/contact`, `/accessibility` |
| Selling a loved one's house (family transition funnel + printable partner guide) | `/sell-loved-ones-house`, `/family-property-guide` |
| Thank-you (post-submit), Privacy, Terms, 404 | `/thank-you`, `/privacy`, `/terms` |
| Shared HQ CRM (dashboard, leads, partners & ROI, first-party website stats) | `/hq`, `/hq/leads`, `/hq/partners`, `/hq/stats/*` |

Also: lead form API (`/api/leads`), private Harbison Standard intake bridge (`/api/intake`), first-party privacy-preserving analytics collector (`/api/track`), Vercel Web Analytics & Speed Insights, `sitemap.xml`, `robots.txt` (AI crawlers explicitly allowed on public pages; `/hq` and `/thank-you` disallowed), `llms.txt`, favicon, Open Graph/Twitter tags, a connected Schema.org `@graph` on every page (RealEstateAgent, Person with DRE license credential, WebSite, WebPage, Service, Article, BreadcrumbList, FAQPage), answer-first "Quick answer" blocks, an "At a glance" facts section, GA4/GTM support, a sticky mobile call bar, spam honeypot + IP/phone rate limiting, signed thank-you detail tokens, and UTM tracking on leads.

## Project layout

```
site.config.mjs          ← phone, email, service area, site URL, GA4/GTM validation (edit once, used everywhere)
src/content.mjs          ← original situations, areas, FAQs, images
src/content-extra.mjs    ← About page, guides, testimonials, "at a glance" facts, California City page
src/content-playbook.mjs ← site-playbook content: hero, 5 paths, seller promise, offer math, form options, new pages
src/family.mjs           ← "Selling a loved one's house" funnel content
src/templates.mjs        ← HTML layout, structured data, interactive net estimator, and page templates
static/                  ← fingerprinted styles.css / script.js / analytics.js, self-hosted fonts, images, /hq panel
api/leads.js             ← serverless function: public website lead form + signed thank-you details
api/hq.js                ← serverless function: shared HQ CRM, CSV import/export, partners/spend, health check
api/intake.js            ← serverless function: authenticated server-to-server bridge from Harbison Standard
api/track.js             ← serverless function: first-party analytics forwarder + CSP report sink
lib/                     ← shared intake normalizer, IP/rate-limit helper, transient retry helper, CSV/JSON importer
build.mjs                ← generates ./dist (pages, fingerprinted assets, sitemap.xml, robots.txt, llms.txt)
dev.mjs, dev/            ← local preview server and the HQ mock database
supabase/                ← schema.sql + migrations 002–005 (applied to the harbison-buys-homes project)
test/                    ← `npm test`
brand/                   ← logo originals (not deployed)
docs/                    ← shared CRM runbook, project record, sitemap overview, family-funnel notes
.github/workflows/ci.yml ← runs tests + build on every push
```

## Branches

`main` is the only long-lived branch and is what Vercel deploys to production. Do new work on a short-lived branch, open a pull request (CI runs automatically), merge, then delete the branch. Past feature branches are preserved as `archive/*` tags.

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

If no storing destination is configured (or if a configured Supabase CRM fails to store the lead), `/api/leads` returns `502` rather than reporting false success to the visitor. Partial notification failures (such as a failed email alert after a successful Supabase insert) are recorded directly on the lead's HQ activity timeline.

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

`static/assets/` holds the logo cut from the brand sheet: `logo-horizontal-v2.png` (full color, transparent), `logo-header-reverse-v2.png` (ivory + gold for navy), `logo-symbol-gold.png`, app/favicon icons, and `og-default.jpg`. For the sharpest icons, replace them with exports from the original vector logo file when available.

## HQ panel (dashboard + CRM) — `/hq`

Private, password-protected team panel at **https://www.callharbison.com/hq**.

- **Dashboard:** leads waiting for first contact, follow-ups due, new today / 7 days, open pipeline, appointments, median time to first contact, gross profit (90 days), leads per week, pipeline by stage, brand, source, path of interest, and a live delivery/integration readiness card with a one-click test email alert (`Send test email alert`).
- **CRM (`/hq/leads`):** filter by view (open, new, follow-ups due, closed, spam, all), brand, or individual stage; punctuation-tolerant phone/text search; `+ New lead` manual intake; duplicate-aware `Import` (CSV/JSON with preview); `Export CSV`; editable contact/property/pipeline fields; outreach logs that automatically record first contact; and deep-linkable lead URLs (`/hq?lead=<id>`).
- **Partners & ROI (`/hq/partners`):** manage referral partner slugs (`callharbison.com/family?ref=<slug>`) and monthly ad spend / CPL / ROAS.
- **Website stats (`/hq/stats/harbison-standard` & `/hq/stats/call-harbison`):** first-party traffic, sources, geography, devices, and pages for each site.
- **Setup:** in Vercel set `HQ_PASSWORD` (long and unique) plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy. Changing the password signs everyone out.
- **Security:** one `/api/hq` function; signed HttpOnly/Secure/SameSite=Strict session cookie (12 hours); failed-login throttling; writes require the panel's own header; edits are whitelisted and validated; the database key never reaches the browser; `/hq` is noindex and blocked in robots.txt.
- **Try it locally with sample data:** `npm run dev -- --mock`, open http://localhost:3000/hq, password `demo`.

## Spanish version — `/es`

Every page is also built in Spanish under `/es` (home, how it works, situations, areas, guides, the family page, contact, the forms, the thank-you page and the legal pages). English stays the source of truth: the build reads each finished English page and swaps every visitor-facing text for its entry in `src/i18n/es/*.json` (keyed by the English text). Links, form values and structured data are handled automatically, and a header switch (English / Español) remembers the visitor's choice.

- **Edited English copy?** Run `node scripts/i18n.mjs extract --out todo.json` to list the texts that now need a Spanish entry, add them to a new file in `src/i18n/es/`, then `node scripts/i18n.mjs check`. `npm test` fails while any text is untranslated; until then the Spanish page simply shows that one text in English.
- **Form values stay English** (what HQ and the CRM read). Only the visible labels change.
- **Spanish leads** are recognised by the page they were submitted from (`/es/...`): the alert email subject gets `[ES]`, the text-message alert says `[SPANISH]`, the automatic acknowledgement text goes out in Spanish, and HQ shows "Spanish" beside the contact.
- **Have a native speaker review the Spanish**, especially the privacy, terms and consent wording. The legal pages carry a note that the English version governs.