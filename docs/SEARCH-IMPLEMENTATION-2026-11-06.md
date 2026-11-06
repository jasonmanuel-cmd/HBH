# Search visibility implementation — 2026-11-06

Built from remote main `0679d068ccadf2f1b15d04a9bb663e1c69dab847` in an isolated checkout. The existing desktop checkout on `signature-web-fix` had uncommitted `src/content-extra.mjs` and `src/templates.mjs`; neither was touched. The user explicitly requested implementation and a main push; this overrides the README's usual PR workflow for this task. Production follows main. No force push, production database changes, account settings changes, indexing submission or outreach is part of this release.

## Published scope and evidence

- Existing Bakersfield seller page: direct cash buyer versus agency/listing, net comparison, written terms, timing dependencies and a clear next step without a guarantee.
- Existing Tehachapi and Stallion Springs pages: jurisdiction, parcel/service verification and useful records to gather; no invented market statistics or transactions.
- Existing inherited-property page: Bakersfield family context, authority-first preparation, general-information disclaimer and links to the California guide and official courts. No claim of Nathanael's legal review.
- Existing land-development page: substantive Tehachapi parcel section at `#tehachapi-land`, linked from the area pages. Legal/physical access, water, utilities, septic, zoning and approvals remain parcel-specific.
- One new guide: `/guides/kern-county-foreclosure-options`, including Tehachapi context, alternatives to selling, servicer/counselor help and official California resources. It does not promise relief or offer foreclosure-prevention services.
- `/buyers`, `/investors`, `/home-value`: cautious general inquiry paths. Current main's `about.paragraphs` already describes work with buyers and investors and investment-property analysis; existing listing/direct-offer comparisons support a value conversation. Representation and scope require separate agreement. No appraisal service, securities, pooled fund, inventory, financing or return guarantee is published. Confirm actual availability and scope before making any stronger service claims.
- Investor introduction appears above the home property-options card; buyer/value links are alongside it. Existing design classes and responsive breakpoints are reused. All new public copy is translated through `src/i18n/es/search-pathways.json`.

Official references checked through available web retrieval/search on November 6, 2026:

- [Kern County Planning inquiries](https://kernplanning.com/public-inquiries-and-faq/): APN/address and zoning inquiries.
- [City of Tehachapi Planning](https://liveuptehachapi.com/326/Planning-Department): city plans and development review.
- [Tehachapi Utility Services](https://www.liveuptehachapi.com/132/Utility-Services): utility and meter information; no parcel availability inference.
- [Stallion Springs CSD water](https://www.stallionspringscsd.com/services/page/water): Cummings Basin groundwater source, confirmed by official search result; full-page retrieval returned 403.
- [Kern Environmental Health](https://www.kernpublichealth.com/environmental-health): official listing of septic-system and well resources. An older specific septic URL returned 403, so the official department resource page is linked instead.
- [California Courts probate overview](https://selfhelp.courts.ca.gov/probate): official search result verified; full-page retrieval returned 403. Existing California inheritance guide retains official IRS/BOE links and general-information disclaimer.
- [CFPB mortgage options](https://www.consumerfinance.gov/ask-cfpb/if-i-cant-pay-my-mortgage-loan-what-are-my-options-en-268/), [CFPB mortgage help](https://www.consumerfinance.gov/mortgagehelp/), [HUD counseling](https://www.hud.gov/counseling), [California homeowner resources](https://oag.ca.gov/consumers/homeowner-issues), [California Homeowner Bill of Rights](https://oag.ca.gov/hbor). No unverified deadline or currently available grant claim is made.

## Intake, recovery and measurement

All three inquiry paths retain `form_type=options`, compatible with the existing protocol SQL allowlist. `route_interest` is `buyer`, `investor` or `home_value`, with a server-normalized situation label. No address or ownership is required. Response consent remains required, marketing optional. New intent is preserved in existing columns, HQ display/edit/manual selectors, export and import; missing-column storage fails rather than silently discarding intent/consent. No schema migration is required.

Both legacy and protocol notification subjects identify address-free inquiries. Notifications are only mocked in tests. All activation/dispatch gates remain unchanged. Address-free inquiries receive no seller-detail token; the neutral thank-you page hides seller details unless the original saved inquiry has that capability. Cross-page recovery continues to resolve the original command. Explicit “Start another inquiry” is required by the existing protocol before creating a new command. No new personal data is put in recovery storage.

Source page, landing page, referrer and UTM attribution remain with the private CRM inquiry. Raw campaign parameters are removed from browser analytics; the collector forwards an explicit bounded field list, excluding arbitrary inquiry fields, title and UTMs. GA's initial page location excludes query/hash and referrer excludes its path/query. Existing GA/GTM identifiers/settings are unchanged. Remote tag settings and enhanced-measurement behavior were not audited; code checks do not establish delivery into the correct live GA account.

`lead_form_success` and `generate_lead` mean a confirmed, newly saved form request. They are two event names for one action, not additive conversions; `generate_lead` carries `qualification=unqualified`. Duplicate/recovered responses do not emit a new success. Browser events are best-effort and can undercount after an interrupted success; CRM stored inquiry IDs are the source for request totals. Qualified inquiries, appointment-set and kept-appointment outcomes must come from recorded HQ evidence, separately from form requests. Never infer qualification from a submission.

## Baseline and 30/60/90-day review

User-provided Search Console domain baseline, Oct 7–Nov 3, 2026: 13 clicks, 586 impressions, 2.2% CTR, average position 63.2. Inherited guide: 239 impressions / 0 clicks. As-is guide: 84 / 0. Sitemap was successful with 64 discovered pages. Oct 22 indexing report: 31 indexed and five excluded (three redirects, two discovered but not indexed). These are dated observations, not a live audit or a traffic promise.

At 30, 60 and 90 days after deployment, manually compare equivalent 28-day windows, retaining the baseline and noting seasonality and the small sample. Record:

1. Domain clicks, impressions, CTR and average position, then page/query groups for Bakersfield fast-sale/cash-buyer, Tehachapi/Stallion Springs, inheritance, land and foreclosure. Separate branded/nonbranded and English/Spanish where data permits.
2. New buyer/investor/value page visibility and private CRM inquiry counts by intent and organic attribution. Deduplicate by inquiry ID; show qualified inquiries and booked/kept appointments separately, with the definitions and reporting limitations from the seller-operations runbook.
3. Sitemap discovery and indexing changes. The two unknown discovered-not-indexed URLs and Google's selected canonicals need separate authenticated Search Console inspection. HTTP 200 and self-canonical markup do not prove indexing or Google's canonical choice.
4. Which pages earned impressions but few clicks, and whether the query matches the page's actual service. Refine useful copy and titles after enough evidence; do not create thin city duplicates or fabricate reviews/case studies.

No scheduled task, automated report, indexing request or Google Business Profile change was enabled.

## Verification and remaining boundaries

The full Node suite includes local mocks and disposable PGlite SQL, not production leads. Added checks cover all new intents, mandatory consent, duplicate requests, storage failure/no alerts, legacy retries, protocol lost-response/cross-page recovery, explicit new inquiries, seller-detail capability isolation, HQ route acceptance and analytics field filtering. Existing SEO, canonical, JSON-LD, robots, Spanish, estimator and reliability checks remain required.

Visual browser automation attempts timed out in `cua_repl` (including browser inventory's Statsig timeout). No desktop/mobile screenshot pass is claimed. Native browser windows used by other tasks were not controlled. Review English/Spanish at 320/375/768/1440px, keyboard focus/error recovery and the home investor-card spacing when the supported browser is available. Static responsive CSS and form markup checks do not substitute for that visual review. A native Spanish editorial review is also outstanding, especially legal/consent wording.

Live submission, SMS/email delivery, production DB behavior, GA account delivery, authenticated indexing/canonical inspection, and program eligibility were not tested. No live customer test record was created. Exact final test/CI/deployment evidence is reported with the delivery commit.
